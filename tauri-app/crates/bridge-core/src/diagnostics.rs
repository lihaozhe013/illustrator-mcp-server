use std::{
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::Utc;
use plist::Value as PlistValue;
use serde::Deserialize;

use crate::model::{BridgeId, BridgeStatus, CheckState, ClientStatus, Dashboard, LayerStatus};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyHealth {
    bridge: String,
    plugin_connected: bool,
    outcome_unknown: bool,
}

#[must_use]
pub fn get_dashboard() -> Dashboard {
    let support = application_support_dir();
    let bridges = [BridgeId::Illustrator, BridgeId::Indesign]
        .into_iter()
        .map(|bridge| diagnose_bridge(bridge, &support))
        .collect();
    let clients = vec![diagnose_opencode(), diagnose_workbuddy()];
    Dashboard {
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        architecture: format!("{}-apple-darwin", std::env::consts::ARCH),
        installation: LayerStatus::new(
            CheckState::InstalledNotRunning,
            "Manager is running locally.",
        ),
        bridges,
        clients,
        last_checked: Utc::now(),
    }
}

#[allow(clippy::too_many_lines)]
fn diagnose_bridge(bridge: BridgeId, support: &Path) -> BridgeStatus {
    let app = find_adobe_app(bridge);
    let application = match app {
        Some((path, version)) => LayerStatus::new(
            CheckState::InstalledNotRunning,
            format!(
                "Detected at {} (version {}).",
                path.display(),
                version.unwrap_or_else(|| "unknown".to_owned())
            ),
        ),
        None => LayerStatus::new(
            CheckState::NotInstalled,
            format!("{} was not found in /Applications.", bridge.label()),
        ),
    };

    let runtime_path = support
        .join("runtimes")
        .join(bridge.as_str())
        .join("current");
    let (runtime, version) = match std::fs::read_link(&runtime_path) {
        Ok(target) => {
            let resolved = if target.is_absolute() {
                target
            } else {
                runtime_path.parent().unwrap_or(support).join(target)
            };
            let manifest = resolved.join("bridge-runtime.json");
            match std::fs::read_to_string(manifest)
                .ok()
                .and_then(|source| serde_json::from_str::<serde_json::Value>(&source).ok())
            {
                Some(value) => {
                    let version = value
                        .get("version")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_owned);
                    (
                        LayerStatus::new(
                            CheckState::InstalledNotRunning,
                            "A managed runtime is installed.",
                        ),
                        version,
                    )
                }
                None => (
                    LayerStatus::new(
                        CheckState::Degraded,
                        "The installed runtime manifest is missing or invalid.",
                    ),
                    None,
                ),
            }
        }
        Err(_) => (
            LayerStatus::new(
                CheckState::NotInstalled,
                "The managed runtime has not been installed.",
            ),
            None,
        ),
    };

    let (service, extension, mcp) = if bridge == BridgeId::Indesign {
        match proxy_health() {
            Some(health) if health.bridge == "indesign" => {
                let extension = if health.plugin_connected {
                    LayerStatus::new(
                        CheckState::Connected,
                        "One authenticated InDesign UXP panel is connected.",
                    )
                } else {
                    LayerStatus::new(CheckState::WaitingForPlugin, "Start Adobe AI Bridge in the InDesign UXP panel and enter its one-time token.")
                };
                let service = LayerStatus::new(
                    CheckState::Connected,
                    "The loopback InDesign proxy answered its health check.",
                );
                let mcp = if health.outcome_unknown {
                    LayerStatus::new(CheckState::Degraded, "A previous document operation has an unknown outcome; inspect the document before recovery.")
                } else {
                    LayerStatus::new(CheckState::Degraded, "Proxy health is verified; MCP initialize and document read have not been run from this manager.")
                };
                (service, extension, mcp)
            }
            _ => (
                LayerStatus::new(
                    CheckState::InstalledNotRunning,
                    "The InDesign proxy is not answering on 127.0.0.1:3001.",
                ),
                LayerStatus::new(
                    CheckState::WaitingForPlugin,
                    "The UXP connection has not been verified.",
                ),
                LayerStatus::new(
                    CheckState::Degraded,
                    "MCP initialize and document read have not been verified.",
                ),
            ),
        }
    } else {
        (
            LayerStatus::new(
                CheckState::InstalledNotRunning,
                "Illustrator MCP servers are started by OpenCode or WorkBuddy on demand.",
            ),
            LayerStatus::new(
                CheckState::Degraded,
                "macOS Automation permission has not been checked by a real Illustrator read.",
            ),
            LayerStatus::new(
                CheckState::Degraded,
                "MCP initialize and document read have not been verified from the manager.",
            ),
        )
    };

    BridgeStatus {
        id: bridge,
        name: bridge.label().to_owned(),
        application,
        runtime,
        service,
        extension,
        mcp,
        version,
    }
}

fn find_adobe_app(bridge: BridgeId) -> Option<(PathBuf, Option<String>)> {
    let apps = std::fs::read_dir("/Applications").ok()?;
    let needle = match bridge {
        BridgeId::Illustrator => "Adobe Illustrator",
        BridgeId::Indesign => "Adobe InDesign",
    };
    for entry in apps.flatten() {
        let path = entry.path();
        if !path.file_name()?.to_string_lossy().starts_with(needle)
            || path.extension()?.to_string_lossy() != "app"
        {
            continue;
        }
        let version = PlistValue::from_file(path.join("Contents/Info.plist"))
            .ok()
            .and_then(|plist| plist.as_dictionary().cloned())
            .and_then(|values| {
                values
                    .get("CFBundleShortVersionString")
                    .and_then(PlistValue::as_string)
                    .map(str::to_owned)
            });
        return Some((path, version));
    }
    None
}

fn proxy_health() -> Option<ProxyHealth> {
    let mut stream =
        TcpStream::connect_timeout(&"127.0.0.1:3001".parse().ok()?, Duration::from_millis(350))
            .ok()?;
    stream
        .set_read_timeout(Some(Duration::from_millis(350)))
        .ok()?;
    stream
        .set_write_timeout(Some(Duration::from_millis(350)))
        .ok()?;
    stream
        .write_all(b"GET /bridge/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let body = response.split_once("\r\n\r\n")?.1;
    serde_json::from_str(body).ok()
}

fn diagnose_opencode() -> ClientStatus {
    let home = dirs::home_dir().unwrap_or_default();
    let candidates = [
        home.join(".config/opencode/opencode.json"),
        home.join(".config/opencode/opencode.jsonc"),
        home.join(".opencode/opencode.json"),
    ];
    let path = candidates.iter().find(|path| path.is_file());
    let (state, detail, schema) = match path {
        Some(path) => match std::fs::read_to_string(path) {
            Ok(text) => {
                let value = jsonc_parser::parse_to_serde_value::<serde_json::Value>(
                    &text,
                    &jsonc_parser::ParseOptions::default(),
                )
                .ok();
                let schema = value
                    .as_ref()
                    .and_then(|value| value.get("mcp"))
                    .and_then(serde_json::Value::as_object)
                    .map(|mcp| {
                        if mcp.get("servers").is_some() {
                            "opencode-v2"
                        } else {
                            "opencode-stable"
                        }
                    });
                (
                    CheckState::InstalledNotRunning,
                    "Configuration file detected; server registration has not been verified."
                        .to_owned(),
                    schema.map(str::to_owned),
                )
            }
            Err(_) => (
                CheckState::Error,
                "The configuration file could not be read.".to_owned(),
                None,
            ),
        },
        None => (
            CheckState::NotInstalled,
            "No supported OpenCode user configuration file was found.".to_owned(),
            None,
        ),
    };
    ClientStatus {
        id: "opencode".to_owned(),
        name: "OpenCode".to_owned(),
        state,
        detail,
        config_path: path.map(|path| path.display().to_string()),
        schema,
        last_verified: Some(Utc::now()),
    }
}

fn diagnose_workbuddy() -> ClientStatus {
    let home = dirs::home_dir().unwrap_or_default();
    let candidates = [
        home.join(".workbuddy/mcp.json"),
        home.join("Library/Application Support/WorkBuddy/mcp.json"),
    ];
    let path = candidates.iter().find(|path| path.is_file());
    let (state, detail) = match path {
        Some(path) => match std::fs::read_to_string(path) {
            Ok(_) => (
                CheckState::InstalledNotRunning,
                "Configuration file detected; installed WorkBuddy schema has not been live-tested."
                    .to_owned(),
            ),
            Err(_) => (
                CheckState::Error,
                "The configuration file could not be read.".to_owned(),
            ),
        },
        None => (
            CheckState::NotInstalled,
            "No supported WorkBuddy user configuration file was found.".to_owned(),
        ),
    };
    ClientStatus {
        id: "workbuddy".to_owned(),
        name: "Tencent WorkBuddy".to_owned(),
        state,
        detail,
        config_path: path.map(|path| path.display().to_string()),
        schema: path.map(|_| "workbuddy-mcpServers".to_owned()),
        last_verified: Some(Utc::now()),
    }
}

#[must_use]
pub fn application_support_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_default()
                .join("Library/Application Support")
        })
        .join("AdobeAIBridge")
}
