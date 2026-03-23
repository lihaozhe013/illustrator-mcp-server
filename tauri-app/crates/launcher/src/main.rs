use std::{
    env, fs,
    io::{self, BufRead, BufReader, BufWriter, Write},
    path::Path,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use adobe_ai_bridge_core::model::BridgeId;
use serde_json::Value;

fn main() {
    if let Err((code, message)) = run() {
        eprintln!("Adobe AI Bridge launcher: {message}");
        std::process::exit(code);
    }
}

#[allow(clippy::too_many_lines)]
fn run() -> Result<(), (i32, String)> {
    let mut args = env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new("--bridge")) {
        return Err((64, "expected --bridge illustrator|indesign".to_owned()));
    }
    let bridge = match args
        .next()
        .and_then(|value| value.into_string().ok())
        .as_deref()
    {
        Some("illustrator") => BridgeId::Illustrator,
        Some("indesign") => BridgeId::Indesign,
        _ => return Err((64, "bridge must be illustrator or indesign".to_owned())),
    };
    if args.next().is_some() {
        return Err((64, "unexpected launcher arguments".to_owned()));
    }

    let support = adobe_ai_bridge_core::diagnostics::application_support_dir();
    let bridge_root = support.join("runtimes").join(bridge.as_str());
    let current = bridge_root.join("current");
    let current_target = fs::read_link(&current).map_err(|_| {
        (
            78,
            format!(
                "the {} runtime is not installed; open Adobe AI Bridge and install it",
                bridge.as_str()
            ),
        )
    })?;
    let versions = bridge_root
        .join("versions")
        .canonicalize()
        .map_err(|_| (78, "the installed runtime is missing".to_owned()))?;
    let runtime = if current_target.is_absolute() {
        current_target
    } else {
        bridge_root.join(current_target)
    }
    .canonicalize()
    .map_err(|_| (78, "the installed runtime could not be opened".to_owned()))?;
    if !runtime.starts_with(&versions) {
        return Err((
            78,
            "the installed runtime pointer is outside its managed version directory".to_owned(),
        ));
    }
    let manifest: Value = serde_json::from_slice(
        &fs::read(runtime.join("bridge-runtime.json"))
            .map_err(|_| (78, "the installed runtime manifest is missing".to_owned()))?,
    )
    .map_err(|_| (78, "the installed runtime manifest is invalid".to_owned()))?;
    if manifest.get("bridgeId").and_then(Value::as_str) != Some(bridge.as_str()) {
        return Err((
            78,
            "the installed runtime does not match the requested bridge".to_owned(),
        ));
    }

    let (program, command_args) = match bridge {
        BridgeId::Illustrator => {
            let node = support.join("shared/node/current/bin/node");
            let entry = runtime.join("dist/bundle.cjs");
            require_regular_file(&node, "the bundled Node runtime is missing")?;
            require_regular_file(&entry, "the Illustrator MCP entrypoint is missing")?;
            (node, vec![entry.into_os_string()])
        }
        BridgeId::Indesign => {
            let entry = runtime.join("bin/adobe-indesign-mcp");
            require_regular_file(&entry, "the bundled InDesign MCP entrypoint is missing")?;
            (entry, Vec::new())
        }
    };

    let mut child = Command::new(&program);
    child
        .args(command_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .env("PATH", runtime_path(&support));
    match bridge {
        BridgeId::Illustrator => {
            child.current_dir(&runtime);
        }
        BridgeId::Indesign => {
            let token_path = support.join("state/indesign.token");
            let metadata = fs::metadata(&token_path).map_err(|_| {
                (
                    78,
                    "the InDesign proxy token is missing; start the InDesign bridge from the manager"
                        .to_owned(),
                )
            })?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if metadata.permissions().mode() & 0o077 != 0 {
                    return Err((
                        78,
                        "the InDesign proxy token file permissions are unsafe".to_owned(),
                    ));
                }
            }
            let token = fs::read_to_string(token_path)
                .map_err(|_| (78, "the InDesign proxy token could not be read".to_owned()))?;
            if token.trim().len() < 32 {
                return Err((78, "the InDesign proxy token is invalid".to_owned()));
            }
            child
                .env("INDESIGN_BRIDGE_TOKEN", token.trim())
                .env("INDESIGN_BRIDGE_PROXY_URL", "http://127.0.0.1:3001")
                .env("INDESIGN_BRIDGE_STATE_DIR", support.join("state"))
                .current_dir(&runtime);
        }
    }

    let mut child = child.spawn().map_err(|_| {
        (
            70,
            format!("could not start the {} MCP runtime", bridge.as_str()),
        )
    })?;
    let child_input = child
        .stdin
        .take()
        .ok_or((70, "the MCP process did not accept stdio input".to_owned()))?;
    let child_output = child.stdout.take().ok_or((
        70,
        "the MCP process did not provide stdio output".to_owned(),
    ))?;

    let output = Arc::new(Mutex::new(BufWriter::new(io::stdout())));
    let response_output = Arc::clone(&output);
    let response_reader = thread::spawn(move || {
        let mut reader = BufReader::new(child_output);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let output_line = match serde_json::from_str::<Value>(line.trim_end()) {
                        Ok(mut message) => {
                            filter_tools_list(&mut message, bridge);
                            serde_json::to_string(&message)
                                .unwrap_or_else(|_| line.trim_end().to_owned())
                        }
                        Err(_) => line.trim_end().to_owned(),
                    };
                    if write_protocol_line(&response_output, &output_line).is_err() {
                        break;
                    }
                }
            }
        }
    });

    let mut writer = BufWriter::new(child_input);
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = line.map_err(|_| (74, "could not read MCP stdio input".to_owned()))?;
        if let Ok(message) = serde_json::from_str::<Value>(&line) {
            if is_tool_call(&message) {
                let Some(name) = message.pointer("/params/name").and_then(Value::as_str) else {
                    if let Some(id) = message.get("id") {
                        let _ = write_protocol_line(
                            &output,
                            &json_rpc_error(
                                id,
                                -32602,
                                "The MCP tool call is missing a tool name.",
                            ),
                        );
                    }
                    continue;
                };
                if !tool_is_allowed(bridge, name) {
                    if let Some(id) = message.get("id") {
                        let _ = write_protocol_line(
                            &output,
                            &json_rpc_error(
                                id,
                                -32601,
                                "This tool is not enabled by the Adobe AI Bridge default allowlist.",
                            ),
                        );
                    }
                    continue;
                }
            }
        }
        writeln!(writer, "{line}")
            .map_err(|_| (70, "the MCP runtime stopped accepting requests".to_owned()))?;
        writer
            .flush()
            .map_err(|_| (70, "the MCP runtime stopped accepting requests".to_owned()))?;
    }
    drop(writer);
    let status = child
        .wait()
        .map_err(|_| (70, "could not wait for the MCP process".to_owned()))?;
    let _ = response_reader.join();
    if status.success() {
        Ok(())
    } else {
        Err((
            status.code().unwrap_or(1),
            "the MCP runtime exited with an error".to_owned(),
        ))
    }
}

fn is_tool_call(message: &Value) -> bool {
    message.get("method").and_then(Value::as_str) == Some("tools/call")
}

fn tool_is_allowed(bridge: BridgeId, name: &str) -> bool {
    match bridge {
        BridgeId::Illustrator => matches!(
            name,
            "get_document_info" | "get_artboards" | "list_fonts" | "convert_coordinate"
        ),
        BridgeId::Indesign => matches!(
            name,
            "get_active_document_settings"
                | "get_document_info"
                | "get_page_image"
                | "get_story_contents"
                | "get_documents"
        ),
    }
}

fn filter_tools_list(message: &mut Value, bridge: BridgeId) {
    let Some(tools) = message
        .pointer_mut("/result/tools")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    tools.retain(|tool| {
        tool.get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| tool_is_allowed(bridge, name))
    });
}

fn json_rpc_error(id: &Value, code: i64, message: &str) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message }
    })
    .to_string()
}

fn write_protocol_line(output: &Arc<Mutex<BufWriter<io::Stdout>>>, line: &str) -> io::Result<()> {
    let mut output = output
        .lock()
        .map_err(|_| io::Error::other("protocol output lock was poisoned"))?;
    writeln!(output, "{line}")?;
    output.flush()
}

fn require_regular_file(path: &Path, message: &str) -> Result<(), (i32, String)> {
    let metadata = fs::symlink_metadata(path).map_err(|_| (78, message.to_owned()))?;
    if !metadata.file_type().is_file() {
        return Err((78, message.to_owned()));
    }
    Ok(())
}

fn runtime_path(support: &Path) -> String {
    let shared = support.join("shared/node/current/bin");
    format!("{}:/usr/bin:/bin:/usr/sbin:/sbin", shared.display())
}

#[cfg(test)]
mod tests {
    use super::{filter_tools_list, runtime_path, tool_is_allowed};
    use adobe_ai_bridge_core::model::BridgeId;
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn launcher_uses_a_developer_path_independent_system_path() {
        assert_eq!(
            runtime_path(Path::new("/app support")),
            "/app support/shared/node/current/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        );
    }

    #[test]
    fn engine_allowlists_do_not_expose_upstream_write_or_script_tools() {
        assert!(tool_is_allowed(BridgeId::Illustrator, "get_document_info"));
        assert!(!tool_is_allowed(BridgeId::Illustrator, "create_document"));
        assert!(!tool_is_allowed(BridgeId::Indesign, "populate_template"));
        assert!(!tool_is_allowed(
            BridgeId::Indesign,
            "create_action_sequence"
        ));
    }

    #[test]
    fn tools_list_is_filtered_to_the_engine_allowlist() {
        let mut message = json!({"jsonrpc":"2.0","id":1,"result":{"tools":[
            {"name":"get_document_info"}, {"name":"create_document"}
        ]}});
        filter_tools_list(&mut message, BridgeId::Illustrator);
        assert_eq!(
            message["result"]["tools"],
            json!([{ "name": "get_document_info" }])
        );
    }
}
