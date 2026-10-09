use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use jsonc_parser::{parse_to_serde_value, ParseOptions};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::model::{ActionResult, BridgeId};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ClientId {
    Opencode,
    Workbuddy,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientConfigDocument {
    pub client: ClientId,
    pub path: String,
    pub text: String,
    pub sha256: Option<String>,
    pub exists: bool,
}

/// Reads a supported client configuration without changing it.
///
/// # Errors
/// Returns a typed result when the home directory, file, or JSONC input cannot be read safely.
pub fn read_client_config(client: ClientId) -> Result<ClientConfigDocument, ActionResult> {
    let path = config_path(client).ok_or_else(|| {
        ActionResult::failure(
            "HOME_UNAVAILABLE",
            "The user home directory could not be resolved.",
            "Sign in to macOS and retry from your user account.",
        )
    })?;
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(ActionResult::failure(
            "CONFIG_SYMLINK_REJECTED",
            "The client configuration is a symbolic link and was not read.",
            "Move the config to the supported user path or replace the link yourself.",
        )),
        Ok(_) => match fs::read_to_string(&path) {
            Ok(text) => Ok(ClientConfigDocument {
                client,
                path: path.display().to_string(),
                sha256: Some(sha256(text.as_bytes())),
                text,
                exists: true,
            }),
            Err(_) => Err(ActionResult::failure(
                "CONFIG_READ_FAILED",
                "The client configuration could not be read.",
                "Check the file permissions and retry.",
            )),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(ClientConfigDocument {
            client,
            path: path.display().to_string(),
            text: "{}\n".to_owned(),
            sha256: None,
            exists: false,
        }),
        Err(_) => Err(ActionResult::failure(
            "CONFIG_READ_FAILED",
            "The client configuration could not be inspected.",
            "Check the file path and permissions, then retry.",
        )),
    }
}

#[must_use]
pub fn apply_client_config(
    client: ClientId,
    bridge: BridgeId,
    expected_sha256: Option<&str>,
    proposed_text: &str,
) -> ActionResult {
    let launcher = crate::diagnostics::application_support_dir().join("bin/adobe-mcp-launcher");
    if !launcher.is_file() {
        return ActionResult::failure(
            "LAUNCHER_NOT_INSTALLED",
            "The stable Adobe AI Bridge launcher is not installed yet.",
            "Install at least one verified bridge runtime before applying a client configuration.",
        );
    }
    let Some(path) = config_path(client) else {
        return ActionResult::failure(
            "HOME_UNAVAILABLE",
            "The user home directory could not be resolved.",
            "Sign in to macOS and retry from your user account.",
        );
    };
    let current = match read_current(&path) {
        Ok(value) => value,
        Err(result) => return result,
    };
    if current
        .as_ref()
        .map(|text| sha256(text.as_bytes()))
        .as_deref()
        != expected_sha256
    {
        return ActionResult::failure(
            "CONFIG_CHANGED",
            "The client configuration changed after preview; no write was made.",
            "Preview the updated file again before applying the bridge entry.",
        );
    }
    let old_text = current.as_deref().unwrap_or("{}\n");
    let Ok(old_value) = parse_jsonc(old_text) else {
        return ActionResult::failure(
            "CONFIG_INVALID",
            "The existing client configuration is not valid JSONC.",
            "Fix the configuration syntax in the client, then preview again.",
        );
    };
    let Ok(new_value) = parse_jsonc(proposed_text) else {
        return ActionResult::failure(
            "PREVIEW_INVALID",
            "The proposed client configuration is not valid JSONC.",
            "Close the preview and generate it again.",
        );
    };
    let path_in_config = config_entry_path(client, bridge, &new_value);
    let expected_entry = managed_entry(client, bridge, path_in_config.schema);
    if get_at_path(&new_value, &path_in_config.path) != Some(&expected_entry) {
        return ActionResult::failure(
            "ENTRY_MISMATCH",
            "The proposed bridge entry does not match the manager-owned launcher configuration.",
            "Refresh the preview and apply the exact generated entry.",
        );
    }
    if !configs_match_except_entry(&old_value, &new_value, &path_in_config.path) {
        return ActionResult::failure(
            "UNRELATED_CONFIG_CHANGE",
            "The proposed edit changes settings outside the selected Adobe AI Bridge entry.",
            "Discard this preview and create a new preview from the current configuration.",
        );
    }
    if get_at_path(&old_value, &path_in_config.path).is_some() {
        return ActionResult::failure(
            "CONFIG_CONFLICT",
            "A different entry already uses this bridge name.",
            "Rename or remove the existing client entry before adding this bridge.",
        );
    }

    match atomic_write_config(&path, proposed_text.as_bytes(), current.as_deref()) {
        Ok(()) => ActionResult::success(
            "CONFIG_APPLIED",
            "The selected bridge entry was written with a backup.",
            "Restart or reload the client, then verify MCP initialize and tools/list there.",
        ),
        Err(_) => ActionResult::failure(
            "CONFIG_WRITE_FAILED",
            "The client configuration could not be written safely.",
            "The previous file remains in place; check directory permissions and retry.",
        ),
    }
}

#[derive(Clone, Debug)]
struct EntryPath {
    schema: &'static str,
    path: Vec<String>,
}

fn config_entry_path(client: ClientId, bridge: BridgeId, config: &Value) -> EntryPath {
    let name = format!("{}-ai-bridge", bridge.as_str());
    match client {
        ClientId::Workbuddy => EntryPath {
            schema: "workbuddy-mcpServers",
            path: vec!["mcpServers".to_owned(), name],
        },
        ClientId::Opencode => {
            let is_v2 = config
                .get("mcp")
                .and_then(Value::as_object)
                .is_some_and(|mcp| mcp.get("servers").is_some());
            if is_v2 {
                EntryPath {
                    schema: "opencode-v2",
                    path: vec!["mcp".to_owned(), "servers".to_owned(), name],
                }
            } else {
                EntryPath {
                    schema: "opencode-stable",
                    path: vec!["mcp".to_owned(), name],
                }
            }
        }
    }
}

fn managed_entry(client: ClientId, bridge: BridgeId, schema: &str) -> Value {
    let launcher = crate::diagnostics::application_support_dir()
        .join("bin/adobe-mcp-launcher")
        .display()
        .to_string();
    let args = vec!["--bridge".to_owned(), bridge.as_str().to_owned()];
    match client {
        ClientId::Workbuddy => json!({ "command": launcher, "args": args, "env": {} }),
        ClientId::Opencode if schema == "opencode-v2" => json!({
            "type": "local", "command": [launcher, "--bridge", bridge.as_str()], "disabled": false
        }),
        ClientId::Opencode => json!({
            "type": "local", "command": [launcher, "--bridge", bridge.as_str()], "enabled": true
        }),
    }
}

fn config_path(client: ClientId) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = match client {
        ClientId::Opencode => vec![
            home.join(".config/opencode/opencode.json"),
            home.join(".config/opencode/opencode.jsonc"),
            home.join(".opencode/opencode.json"),
        ],
        ClientId::Workbuddy => vec![
            home.join(".workbuddy/mcp.json"),
            home.join("Library/Application Support/WorkBuddy/mcp.json"),
        ],
    };
    candidates
        .iter()
        .find(|candidate| candidate.is_file())
        .cloned()
        .or_else(|| candidates.into_iter().next())
}

fn read_current(path: &Path) -> Result<Option<String>, ActionResult> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(ActionResult::failure(
            "CONFIG_SYMLINK_REJECTED",
            "The client configuration is a symbolic link and was not changed.",
            "Move the config to the supported user path or replace the link yourself.",
        )),
        Ok(_) => fs::read_to_string(path).map(Some).map_err(|_| {
            ActionResult::failure(
                "CONFIG_READ_FAILED",
                "The client configuration could not be read.",
                "Check the file permissions and retry.",
            )
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(ActionResult::failure(
            "CONFIG_READ_FAILED",
            "The client configuration could not be inspected.",
            "Check the file path and permissions, then retry.",
        )),
    }
}

fn parse_jsonc(text: &str) -> Result<Value, ()> {
    let options = ParseOptions {
        allow_comments: true,
        allow_trailing_commas: true,
        allow_loose_object_property_names: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
        allow_bare_decimal_point_numbers: false,
        allow_non_finite_numbers: false,
        allow_extended_string_escapes: false,
    };
    parse_to_serde_value::<Value>(text, &options).map_err(|_| ())
}

fn get_at_path<'a>(value: &'a Value, path: &[String]) -> Option<&'a Value> {
    path.iter()
        .try_fold(value, |current, segment| current.get(segment))
}

fn remove_at_path(value: &mut Value, path: &[String]) {
    if let Some((last, parent)) = path.split_last() {
        let mut current = value;
        for segment in parent {
            let Some(next) = current.get_mut(segment) else {
                return;
            };
            current = next;
        }
        if let Some(object) = current.as_object_mut() {
            object.remove(last);
        }
    }
}

fn configs_match_except_entry(old: &Value, new: &Value, path: &[String]) -> bool {
    let mut old_without_entry = old.clone();
    let mut new_without_entry = new.clone();
    remove_entry_and_empty_parents(&mut old_without_entry, path);
    remove_entry_and_empty_parents(&mut new_without_entry, path);
    old_without_entry == new_without_entry
}

fn remove_entry_and_empty_parents(value: &mut Value, path: &[String]) {
    remove_at_path(value, path);

    // Creating a first entry also creates its parent objects. Ignore those empty containers
    // during the unrelated-settings check, while retaining any parent with other settings.
    for ancestor_length in (1..path.len()).rev() {
        let ancestor = &path[..ancestor_length];
        let is_empty_object = get_at_path(value, ancestor)
            .and_then(Value::as_object)
            .is_some_and(serde_json::Map::is_empty);
        if !is_empty_object {
            break;
        }
        remove_at_path(value, ancestor);
    }
}

fn atomic_write_config(
    path: &Path,
    content: &[u8],
    previous: Option<&str>,
) -> Result<(), std::io::Error> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "missing config parent")
    })?;
    fs::create_dir_all(parent)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    if let Some(previous) = previous {
        let backup = parent.join(format!(
            "{}.adobe-ai-bridge-{stamp}.bak",
            path.file_name().unwrap_or_default().to_string_lossy()
        ));
        let mut backup_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(backup)?;
        set_private_permissions(&backup_file)?;
        backup_file.write_all(previous.as_bytes())?;
        backup_file.sync_all()?;
    }

    let temporary = parent.join(format!(".adobe-ai-bridge-{}.tmp", uuid::Uuid::new_v4()));
    let existing_permissions = fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
    let mut temp_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    if let Some(permissions) = existing_permissions {
        temp_file.set_permissions(permissions)?;
    } else {
        set_private_permissions(&temp_file)?;
    }
    temp_file.write_all(content)?;
    temp_file.sync_all()?;
    drop(temp_file);
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    File::open(parent)?.sync_all()?;
    Ok(())
}

fn set_private_permissions(file: &File) -> Result<(), std::io::Error> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn sha256(content: &[u8]) -> String {
    format!("{:x}", Sha256::digest(content))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jsonc_parser_keeps_the_configuration_semantics() {
        let parsed = parse_jsonc("{ // keep me\n \"mcp\": { \"servers\": {}, }, } ").unwrap();
        assert!(parsed.get("mcp").and_then(Value::as_object).is_some());
    }

    #[test]
    fn entry_validation_removes_only_the_selected_bridge_path() {
        let original =
            parse_jsonc(r#"{"mcp":{"servers":{"other":{"command":["other"]}}}}"#).unwrap();
        let proposed = parse_jsonc(r#"{"mcp":{"servers":{"other":{"command":["other"]},"illustrator-ai-bridge":{"type":"local","command":["/root/Library/Application Support/AdobeAIBridge/bin/adobe-mcp-launcher","--bridge","illustrator"],"disabled":false}}}}"#).unwrap();
        let path = config_entry_path(ClientId::Opencode, BridgeId::Illustrator, &proposed);
        assert!(configs_match_except_entry(&original, &proposed, &path.path));
    }

    #[test]
    fn first_workbuddy_entry_may_create_required_parent_object() {
        let original = parse_jsonc("{}").unwrap();
        let proposed = parse_jsonc(
            r#"{"mcpServers":{"illustrator-ai-bridge":{"command":"/bridge","args":["--bridge","illustrator"],"env":{}}}}"#,
        )
        .unwrap();
        let path = config_entry_path(ClientId::Workbuddy, BridgeId::Illustrator, &proposed);

        assert!(configs_match_except_entry(&original, &proposed, &path.path));
    }

    #[test]
    fn second_workbuddy_entry_preserves_the_first_entry() {
        let original = parse_jsonc(
            r#"{"mcpServers":{"illustrator-ai-bridge":{"command":"/bridge","args":["--bridge","illustrator"],"env":{}}}}"#,
        )
        .unwrap();
        let proposed = parse_jsonc(
            r#"{"mcpServers":{"illustrator-ai-bridge":{"command":"/bridge","args":["--bridge","illustrator"],"env":{}},"indesign-ai-bridge":{"command":"/bridge","args":["--bridge","indesign"],"env":{}}}}"#,
        )
        .unwrap();
        let path = config_entry_path(ClientId::Workbuddy, BridgeId::Indesign, &proposed);

        assert!(configs_match_except_entry(&original, &proposed, &path.path));
    }

    #[test]
    fn unrelated_workbuddy_settings_are_still_rejected() {
        let original = parse_jsonc(r#"{"mcpServers":{"other":{"command":"/other"}}}"#).unwrap();
        let proposed = parse_jsonc(
            r#"{"mcpServers":{"other":{"command":"/changed"},"illustrator-ai-bridge":{"command":"/bridge","args":["--bridge","illustrator"],"env":{}}}}"#,
        )
        .unwrap();
        let path = config_entry_path(ClientId::Workbuddy, BridgeId::Illustrator, &proposed);

        assert!(!configs_match_except_entry(
            &original, &proposed, &path.path
        ));
    }
}
