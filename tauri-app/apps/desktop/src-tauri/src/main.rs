#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

use adobe_ai_bridge_core::{
    apply_client_config, copy_indesign_plugin_token, get_dashboard, install_bridge,
    read_client_config, start_indesign_proxy, stop_indesign_proxy, ActionResult, BridgeId,
};
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum ClientId {
    Opencode,
    Workbuddy,
}

impl From<ClientId> for adobe_ai_bridge_core::clients::ClientId {
    fn from(value: ClientId) -> Self {
        match value {
            ClientId::Opencode => Self::Opencode,
            ClientId::Workbuddy => Self::Workbuddy,
        }
    }
}

#[tauri::command]
fn get_dashboard_command() -> adobe_ai_bridge_core::Dashboard {
    get_dashboard()
}

#[tauri::command]
fn read_client_config_command(
    client: ClientId,
) -> Result<adobe_ai_bridge_core::ClientConfigDocument, ActionResult> {
    read_client_config(client.into())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn apply_client_config_command(
    client: ClientId,
    bridge_id: BridgeId,
    expected_sha256: Option<String>,
    text: String,
) -> ActionResult {
    apply_client_config(client.into(), bridge_id, expected_sha256.as_deref(), &text)
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn remove_client_config_command(
    client: ClientId,
    bridge_id: BridgeId,
    expected_sha256: Option<String>,
    text: String,
) -> ActionResult {
    adobe_ai_bridge_core::remove_client_config(
        client.into(),
        bridge_id,
        expected_sha256.as_deref(),
        &text,
    )
}

#[tauri::command]
fn get_launcher_path_command() -> String {
    adobe_ai_bridge_core::diagnostics::application_support_dir()
        .join("bin/adobe-mcp-launcher")
        .display()
        .to_string()
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn install_bridge_command(
    app: AppHandle,
    bridge_id: BridgeId,
) -> adobe_ai_bridge_core::install::BridgeInstallResult {
    let resource_dir = app.path().resource_dir().unwrap_or_else(|_| PathBuf::new());
    install_bridge(bridge_id, &resource_dir)
}

#[tauri::command]
fn rollback_bridge_command(bridge_id: BridgeId) -> ActionResult {
    adobe_ai_bridge_core::install::rollback_bridge(bridge_id)
}

#[tauri::command]
fn uninstall_bridge_command(bridge_id: BridgeId) -> ActionResult {
    adobe_ai_bridge_core::install::uninstall_bridge(bridge_id)
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn open_uxp_package_command(app: AppHandle) -> ActionResult {
    let path = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::new())
        .join("bridges/indesign/indesign-mcp-plugin.ccx");
    if !path.is_file() {
        return ActionResult::failure(
            "UXP_PACKAGE_MISSING",
            "This build does not contain the InDesign UXP installer package.",
            "Build the verified InDesign runtime bundle, then rebuild the desktop app.",
        );
    }
    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("/usr/bin/open").arg(&path).status() {
            Ok(status) if status.success() => ActionResult::success("UXP_PACKAGE_OPENED", "Creative Cloud was asked to open the UXP package.", "Approve the installation in Creative Cloud and open the Adobe AI Bridge panel in InDesign."),
            _ => ActionResult::failure("UXP_OPEN_FAILED", "Creative Cloud could not open the UXP package.", "Open the package from the manager's application resources and follow the Creative Cloud prompt."),
        }
    }
    #[cfg(not(target_os = "macos"))]
    ActionResult::failure(
        "UNSUPPORTED_PLATFORM",
        "InDesign plugin installation is only supported on macOS.",
        "Run Adobe AI Bridge on an Apple Silicon Mac.",
    )
}

#[tauri::command]
fn start_indesign_proxy_command() -> ActionResult {
    start_indesign_proxy()
}

#[tauri::command]
fn stop_indesign_proxy_command() -> ActionResult {
    stop_indesign_proxy()
}

#[tauri::command]
fn copy_indesign_plugin_token_command() -> ActionResult {
    copy_indesign_plugin_token()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_dashboard_command,
            read_client_config_command,
            apply_client_config_command,
            remove_client_config_command,
            get_launcher_path_command,
            install_bridge_command,
            rollback_bridge_command,
            uninstall_bridge_command,
            open_uxp_package_command,
            start_indesign_proxy_command,
            stop_indesign_proxy_command,
            copy_indesign_plugin_token_command,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Adobe AI Bridge desktop application");
}
