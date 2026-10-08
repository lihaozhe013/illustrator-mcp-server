#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use adobe_ai_bridge_core::{
    apply_client_config, copy_indesign_plugin_token, install_all_bridges, read_client_config,
    ActionResult, BridgeId,
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
fn get_launcher_path_command() -> String {
    adobe_ai_bridge_core::diagnostics::application_support_dir()
        .join("bin/adobe-mcp-launcher")
        .display()
        .to_string()
}

#[tauri::command]
async fn install_all_command(app: AppHandle) -> Result<ActionResult, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("application resources are unavailable: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || install_all_bridges(&resource_dir))
        .await
        .map_err(|error| format!("runtime installation task failed: {error}"))
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn setup_indesign_panel_command(app: AppHandle) -> ActionResult {
    let token_result = copy_indesign_plugin_token();
    if !token_result.ok {
        return token_result;
    }

    let path = app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("bridges/indesign/indesign-mcp-plugin.ccx");
    if !path.is_file() {
        return ActionResult::failure(
            "UXP_PACKAGE_MISSING",
            "This build does not contain the InDesign UXP installer package.",
            "Rebuild the verified InDesign runtime bundle, then rebuild the desktop app.",
        );
    }

    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("/usr/bin/open").arg(&path).status() {
            Ok(status) if status.success() => ActionResult::success(
                "INDESIGN_PANEL_SETUP_OPENED",
                "Creative Cloud was asked to open the InDesign panel installer, and the connection token was copied.",
                "Approve the installation in Creative Cloud, open the Adobe AI Bridge panel in InDesign, paste the copied token, then connect.",
            ),
            _ => ActionResult::failure(
                "UXP_OPEN_FAILED",
                "Creative Cloud could not open the InDesign panel installer.",
                "Open the InDesign package from the manager application resources. The connection token is already copied.",
            ),
        }
    }
    #[cfg(not(target_os = "macos"))]
    ActionResult::failure(
        "UNSUPPORTED_PLATFORM",
        "InDesign panel installation is only supported on macOS.",
        "Run Adobe AI Bridge on an Apple Silicon Mac.",
    )
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_client_config_command,
            apply_client_config_command,
            get_launcher_path_command,
            install_all_command,
            setup_indesign_panel_command,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Adobe AI Bridge desktop application");
}
