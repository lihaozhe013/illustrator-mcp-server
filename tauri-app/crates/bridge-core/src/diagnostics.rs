use std::{
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::Utc;
use serde::Deserialize;

use crate::adobe_apps::{discover_adobe_applications, AdobeAppsReport};
use crate::model::{BridgeId, BridgeStatus, CheckState, ClientStatus, Dashboard, LayerStatus};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyHealth {
    bridge: String,
    plugin_connected: bool,
}

#[must_use]
pub fn get_dashboard() -> Dashboard {
    let support = application_support_dir();
    let adobe_apps = discover_adobe_applications();
    let bridges = [BridgeId::Illustrator, BridgeId::Indesign]
        .into_iter()
        .map(|bridge| diagnose_bridge(bridge, &support, &adobe_apps))
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
fn diagnose_bridge(bridge: BridgeId, support: &Path, adobe_apps: &AdobeAppsReport) -> BridgeStatus {
    let applications = adobe_apps.applications_for(bridge);
    let application = adobe_application_status(bridge, adobe_apps, applications.len());

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
                let mcp = LayerStatus::new(
                    CheckState::Degraded,
                    "Proxy health is verified; MCP initialize and document read have not been run from this manager.",
                );
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
        applications,
        runtime,
        service,
        extension,
        mcp,
        version,
    }
}

fn adobe_application_status(
    bridge: BridgeId,
    report: &AdobeAppsReport,
    application_count: usize,
) -> LayerStatus {
    if report.is_installed(bridge) {
        LayerStatus::new(
            CheckState::InstalledNotRunning,
            format!("Detected {application_count} installed application version(s)."),
        )
    } else if report.search_complete {
        LayerStatus::new(
            CheckState::NotInstalled,
            "No supported Adobe application was found in standard locations, macOS registration or Spotlight.",
        )
    } else {
        LayerStatus::new(
            CheckState::Degraded,
            "The Adobe application search was incomplete; some search sources did not respond.",
        )
    }
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

#[cfg(test)]
mod tests {
    use super::adobe_application_status;
    use crate::{
        adobe_apps::{AdobeApplication, AdobeAppsReport},
        model::{BridgeId, CheckState},
    };

    #[test]
    fn application_status_distinguishes_missing_and_incomplete_searches() {
        let missing = adobe_application_status(
            BridgeId::Illustrator,
            &AdobeAppsReport {
                applications: Vec::new(),
                search_complete: true,
            },
            0,
        );
        let incomplete = adobe_application_status(
            BridgeId::Illustrator,
            &AdobeAppsReport {
                applications: Vec::new(),
                search_complete: false,
            },
            0,
        );
        assert_eq!(missing.state, CheckState::NotInstalled);
        assert_eq!(incomplete.state, CheckState::Degraded);
    }

    #[test]
    fn partial_search_still_reports_an_application_that_was_found() {
        let report = AdobeAppsReport {
            applications: vec![AdobeApplication {
                path: "/Applications/Adobe Illustrator.app".to_owned(),
                bundle_id: "com.adobe.illustrator".to_owned(),
                display_name: "Adobe Illustrator".to_owned(),
                version: Some("30.3.0".to_owned()),
            }],
            search_complete: false,
        };

        let status = adobe_application_status(BridgeId::Illustrator, &report, 1);
        assert_eq!(status.state, CheckState::InstalledNotRunning);
        assert_eq!(
            status.detail,
            "Detected 1 installed application version(s)."
        );
    }
}
