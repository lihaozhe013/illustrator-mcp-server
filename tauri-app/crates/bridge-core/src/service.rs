use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use serde_json::Value;
use uuid::Uuid;

use crate::{
    diagnostics::application_support_dir, install::create_private_directory_tree,
    model::ActionResult,
};

const LAUNCH_AGENT_LABEL: &str = "org.adobe-ai-bridge.indesign-proxy";
const PROXY_START_TIMEOUT: Duration = Duration::from_secs(30);

#[must_use]
#[allow(clippy::too_many_lines)]
pub fn start_indesign_proxy() -> ActionResult {
    let support = application_support_dir();
    let current = support.join("runtimes/indesign/current");
    let Ok(runtime) = current.canonicalize() else {
        return ActionResult::failure(
            "INDESIGN_RUNTIME_NOT_INSTALLED",
            "The InDesign runtime is not installed.",
            "Install the InDesign bridge runtime, then start the proxy again.",
        );
    };
    let Ok(versions) = support.join("runtimes/indesign/versions").canonicalize() else {
        return ActionResult::failure(
            "INDESIGN_RUNTIME_NOT_INSTALLED",
            "The managed InDesign runtime versions are missing.",
            "Reinstall the InDesign bridge runtime, then start the proxy again.",
        );
    };
    if !runtime.starts_with(versions) {
        return ActionResult::failure(
            "INDESIGN_RUNTIME_PATH_UNSAFE",
            "The active InDesign runtime points outside its managed version directory.",
            "Reinstall the InDesign bridge runtime before starting the proxy.",
        );
    }
    let node = support.join("shared/node/current/bin/node");
    let proxy = runtime.join("proxy/server.mjs");
    if !regular_file(&node) || !regular_file(&proxy) {
        return ActionResult::failure(
            "INDESIGN_PROXY_BUNDLE_MISSING",
            "The bundled Node runtime or InDesign proxy is missing.",
            "Reinstall the InDesign bridge runtime from the current manager build.",
        );
    }
    if TcpStream::connect_timeout(&loopback_proxy_address(), Duration::from_millis(150)).is_ok() {
        if proxy_health().is_some() {
            return ActionResult::success(
                "INDESIGN_PROXY_ALREADY_RUNNING",
                "The InDesign proxy is already responding on 127.0.0.1:3001.",
                "Open the InDesign UXP panel and use the manager's token copy action.",
            );
        }
        return ActionResult::failure("INDESIGN_PROXY_PORT_CONFLICT", "Port 3001 is occupied by another local service; the manager did not stop or replace it.", "Close the other app yourself or change the proxy port in a future manager configuration, then retry.");
    }

    let state_dir = support.join("state");
    let logs_dir = support.join("logs/indesign");
    let launch_agents = dirs::home_dir()
        .unwrap_or_default()
        .join("Library/LaunchAgents");
    for directory in [&state_dir, &logs_dir, &launch_agents] {
        if let Err(error) = create_private_directory_tree(directory) {
            return ActionResult::failure(
                "INDESIGN_PROXY_SETUP_FAILED",
                format!("A private proxy directory could not be created: {error}"),
                "Check permissions under your macOS user account and retry.",
            );
        }
    }
    if let Err(error) = ensure_token(&state_dir) {
        return ActionResult::failure(
            "INDESIGN_TOKEN_SETUP_FAILED",
            format!("The local proxy token could not be prepared: {error}"),
            "Review the Adobe AI Bridge state directory permissions and retry.",
        );
    }

    let plist_path = launch_agents.join(format!("{LAUNCH_AGENT_LABEL}.plist"));
    if plist_path.exists() || fs::symlink_metadata(&plist_path).is_ok() {
        let existing = fs::symlink_metadata(&plist_path);
        let is_owned_file = existing
            .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
            && fs::read_to_string(&plist_path).is_ok_and(|contents| {
                contents.contains("<!-- Adobe AI Bridge managed LaunchAgent -->")
            });
        if !is_owned_file {
            return ActionResult::failure("INDESIGN_AGENT_OWNERSHIP_CONFLICT", "A different LaunchAgent already uses the Adobe AI Bridge service path.", "Inspect or rename that file yourself; the manager will not replace an unrecognized service.");
        }
    }
    let plist = launch_agent_plist(&node, &proxy, &state_dir, &logs_dir);
    if let Err(error) = write_private_atomic(&plist_path, plist.as_bytes()) {
        return ActionResult::failure(
            "INDESIGN_AGENT_WRITE_FAILED",
            format!("The user LaunchAgent could not be written: {error}"),
            "Check permissions in ~/Library/LaunchAgents and retry.",
        );
    }

    let Some(uid) = current_uid() else {
        return ActionResult::failure(
            "USER_SESSION_UNAVAILABLE",
            "The current macOS user session could not be identified.",
            "Sign in to the desktop user session and retry.",
        );
    };
    let domain = format!("gui/{uid}");
    let service_target = format!("{domain}/{LAUNCH_AGENT_LABEL}");
    let loaded = Command::new("/bin/launchctl")
        .args(["print", &service_target])
        .status()
        .is_ok_and(|status| status.success());
    let started = if loaded {
        Command::new("/bin/launchctl")
            .args(["kickstart", "-k", &service_target])
            .status()
            .is_ok_and(|status| status.success())
    } else {
        Command::new("/bin/launchctl")
            .args([
                "bootstrap",
                &domain,
                plist_path.to_str().unwrap_or_default(),
            ])
            .status()
            .is_ok_and(|status| status.success())
    };
    if !started {
        return ActionResult::failure(
            "INDESIGN_AGENT_START_FAILED",
            "macOS could not start the InDesign proxy LaunchAgent.",
            "Open Diagnostics and check the InDesign proxy log. Other processes were not stopped.",
        );
    }

    if wait_for_proxy_health(PROXY_START_TIMEOUT, || proxy_health().is_some()) {
        return ActionResult::success("INDESIGN_PROXY_STARTED", "The authenticated proxy is responding on 127.0.0.1:3001.", "Open the InDesign UXP panel, then copy the one-time token from the manager into its password field.");
    }
    ActionResult::failure(
        "INDESIGN_PROXY_NOT_HEALTHY",
        "The InDesign proxy did not pass its health check within 30 seconds.",
        "Both runtimes and selected client entries were still installed. Review the InDesign proxy log and retry the proxy after correcting the reported issue.",
    )
}

#[must_use]
#[allow(clippy::too_many_lines)]
pub fn stop_indesign_proxy() -> ActionResult {
    let launch_agents = dirs::home_dir()
        .unwrap_or_default()
        .join("Library/LaunchAgents");
    let plist_path = launch_agents.join(format!("{LAUNCH_AGENT_LABEL}.plist"));
    let Some(uid) = current_uid() else {
        return ActionResult::failure(
            "USER_SESSION_UNAVAILABLE",
            "The current macOS user session could not be identified.",
            "Sign in to the desktop user session and retry.",
        );
    };
    let domain = format!("gui/{uid}");
    let target = format!("{domain}/{LAUNCH_AGENT_LABEL}");
    let loaded = Command::new("/bin/launchctl")
        .args(["print", &target])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success());
    match fs::symlink_metadata(&plist_path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return ActionResult::failure(
                "INDESIGN_AGENT_OWNERSHIP_CONFLICT",
                "The InDesign LaunchAgent path is not a regular manager-owned file.",
                "Inspect the LaunchAgent path yourself; the manager left it untouched.",
            );
        }
        Ok(_) => match fs::read_to_string(&plist_path) {
            Ok(contents) if contents.contains("<!-- Adobe AI Bridge managed LaunchAgent -->") => {}
            _ => {
                return ActionResult::failure(
                    "INDESIGN_AGENT_OWNERSHIP_CONFLICT",
                    "The InDesign LaunchAgent file is not marked as managed by Adobe AI Bridge.",
                    "Inspect the LaunchAgent path yourself; the manager left it untouched.",
                )
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if loaded {
                return ActionResult::failure(
                    "INDESIGN_AGENT_OWNERSHIP_CONFLICT",
                    "A LaunchAgent uses the Adobe AI Bridge service label, but its managed plist is missing.",
                    "Inspect the LaunchAgent yourself; the manager left the running service untouched.",
                );
            }
            if proxy_health().is_some() {
                return ActionResult::failure(
                    "INDESIGN_PROXY_OWNERSHIP_CONFLICT",
                    "An InDesign proxy answers on port 3001, but its manager-owned LaunchAgent is missing.",
                    "Inspect the running service yourself; the manager did not stop it.",
                );
            }
            return ActionResult::success(
                "INDESIGN_PROXY_STOPPED",
                "The InDesign proxy LaunchAgent is already stopped.",
                "The MCP configuration remains in each client until you remove it there.",
            );
        }
        Err(_) => {
            return ActionResult::failure(
                "INDESIGN_AGENT_CLEANUP_FAILED",
                "The LaunchAgent file could not be inspected safely.",
                "Check permissions under ~/Library/LaunchAgents and retry.",
            )
        }
    }
    if !loaded && proxy_health().is_some() {
        return ActionResult::failure(
            "INDESIGN_PROXY_OWNERSHIP_CONFLICT",
            "An InDesign proxy answers on port 3001 but the manager LaunchAgent is not loaded.",
            "Inspect the running service yourself; the manager did not stop it.",
        );
    }
    if loaded {
        let stopped = Command::new("/bin/launchctl")
            .args(["bootout", &target])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if stopped.is_err() || stopped.is_ok_and(|status| !status.success()) {
            return ActionResult::failure(
                "INDESIGN_AGENT_STOP_FAILED",
                "macOS could not stop the InDesign proxy LaunchAgent.",
                "Retry from the same macOS user account and inspect the proxy status.",
            );
        }
        let deadline = Instant::now() + Duration::from_secs(1);
        while Instant::now() < deadline && proxy_health().is_some() {
            thread::sleep(Duration::from_millis(100));
        }
        if proxy_health().is_some() {
            return ActionResult::failure(
                "INDESIGN_PROXY_OWNERSHIP_CONFLICT",
                "Another proxy still answers on port 3001 after the managed LaunchAgent stopped.",
                "The manager left its plist and runtime files in place; inspect the other service before replacing the runtime.",
            );
        }
    }
    if let Err(error) = fs::remove_file(&plist_path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return ActionResult::failure("INDESIGN_AGENT_CLEANUP_FAILED", "The proxy stopped, but its LaunchAgent file could not be removed.", "Remove the Adobe AI Bridge LaunchAgent from ~/Library/LaunchAgents after closing the manager.");
        }
    }
    ActionResult::success(
        "INDESIGN_PROXY_STOPPED",
        "The InDesign proxy LaunchAgent was stopped.",
        "The MCP configuration remains in each client until you remove it there.",
    )
}

#[must_use]
pub fn copy_indesign_plugin_token() -> ActionResult {
    let state_dir = application_support_dir().join("state");
    let token_path = state_dir.join("indesign.token");
    if let Err(error) = ensure_token(&state_dir) {
        return ActionResult::failure(
            "INDESIGN_TOKEN_UNAVAILABLE",
            format!("The InDesign connection token is unavailable: {error}"),
            "Start the InDesign proxy and retry.",
        );
    }
    let Ok(token) = fs::read_to_string(&token_path) else {
        return ActionResult::failure(
            "INDESIGN_TOKEN_UNAVAILABLE",
            "The InDesign connection token could not be read.",
            "Start the InDesign proxy and retry.",
        );
    };
    let Ok(mut child) = Command::new("/usr/bin/pbcopy")
        .stdin(Stdio::piped())
        .spawn()
    else {
        return ActionResult::failure(
            "CLIPBOARD_UNAVAILABLE",
            "macOS could not copy the one-time UXP token.",
            "Copy it from the protected local state file only if directed by support.",
        );
    };
    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(token.trim().as_bytes()).is_err() {
            return ActionResult::failure(
                "CLIPBOARD_UNAVAILABLE",
                "The UXP token could not be copied to the clipboard.",
                "Retry the copy action after the desktop is ready.",
            );
        }
    }
    match child.wait() {
        Ok(status) if status.success() => ActionResult::success("INDESIGN_TOKEN_COPIED", "A one-time local connection token was copied to the clipboard.", "Paste it into the Adobe AI Bridge panel in InDesign. The manager does not log or display the token."),
        _ => ActionResult::failure("CLIPBOARD_UNAVAILABLE", "macOS could not copy the one-time UXP token.", "Retry the copy action after the desktop is ready."),
    }
}

fn ensure_token(state_dir: &Path) -> Result<PathBuf, std::io::Error> {
    create_private_directory_tree(state_dir)
        .map_err(|error| std::io::Error::other(error.to_string()))?;
    let token_path = state_dir.join("indesign.token");
    match fs::symlink_metadata(&token_path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "token path is not a regular file",
            ));
        }
        Ok(metadata) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if metadata.permissions().mode() & 0o077 != 0 {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        "token permissions are not private",
                    ));
                }
            }
            if fs::read_to_string(&token_path)?.trim().len() < 32 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "token is invalid",
                ));
            }
            return Ok(token_path);
        }
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
        Err(_) => {}
    }
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&token_path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(token.as_bytes())?;
    file.sync_all()?;
    Ok(token_path)
}

fn launch_agent_plist(node: &Path, proxy: &Path, state_dir: &Path, logs_dir: &Path) -> String {
    let node = xml_escape(&node.display().to_string());
    let proxy = xml_escape(&proxy.display().to_string());
    let token = xml_escape(&state_dir.join("indesign.token").display().to_string());
    let state = xml_escape(&state_dir.display().to_string());
    let stdout = xml_escape(&logs_dir.join("proxy.stdout.log").display().to_string());
    let stderr = xml_escape(&logs_dir.join("proxy.stderr.log").display().to_string());
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- Adobe AI Bridge managed LaunchAgent -->\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n<key>Label</key><string>{LAUNCH_AGENT_LABEL}</string>\n<key>ProgramArguments</key><array><string>{node}</string><string>{proxy}</string></array>\n<key>EnvironmentVariables</key><dict><key>INDESIGN_BRIDGE_TOKEN_FILE</key><string>{token}</string><key>INDESIGN_BRIDGE_STATE_DIR</key><string>{state}</string><key>INDESIGN_BRIDGE_PROXY_PORT</key><string>3001</string></dict>\n<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ProcessType</key><string>Background</string>\n<key>StandardOutPath</key><string>{stdout}</string><key>StandardErrorPath</key><string>{stderr}</string>\n</dict></plist>\n"
    )
}

fn write_private_atomic(path: &Path, content: &[u8]) -> Result<(), std::io::Error> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "missing LaunchAgent directory",
        )
    })?;
    let temporary = parent.join(format!(".adobe-ai-bridge-{}.tmp", Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    file.write_all(content)?;
    file.sync_all()?;
    drop(file);
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    fs::File::open(parent)?.sync_all()?;
    Ok(())
}

fn proxy_health() -> Option<Value> {
    let mut stream =
        TcpStream::connect_timeout(&loopback_proxy_address(), Duration::from_millis(200)).ok()?;
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .ok()?;
    stream
        .write_all(b"GET /bridge/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    parse_proxy_health_response(&response)
}

fn parse_proxy_health_response(response: &str) -> Option<Value> {
    let (headers, body) = response.split_once("\r\n\r\n")?;
    let status = headers.lines().next()?.split_whitespace().nth(1)?;
    if status != "200" {
        return None;
    }
    let health: Value = serde_json::from_str(body).ok()?;
    (health.get("bridge").and_then(Value::as_str) == Some("indesign")).then_some(health)
}

fn wait_for_proxy_health(timeout: Duration, mut check: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if check() {
            return true;
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return false;
        }
        thread::sleep(Duration::from_millis(200).min(remaining));
    }
}

fn loopback_proxy_address() -> SocketAddr {
    "127.0.0.1:3001"
        .parse()
        .expect("constant loopback proxy address is valid")
}

fn regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn current_uid() -> Option<u32> {
    Command::new("/usr/bin/id")
        .arg("-u")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .and_then(|value| value.trim().parse().ok())
}

#[cfg(test)]
mod tests {
    use super::{
        launch_agent_plist, parse_proxy_health_response, wait_for_proxy_health, xml_escape,
    };
    use serde_json::json;
    use std::{
        path::Path,
        time::{Duration, Instant},
    };

    #[test]
    fn launch_agent_arguments_are_fixed_and_xml_escaped() {
        let plist = launch_agent_plist(
            Path::new("/Users/design & review/node"),
            Path::new("/Users/design & review/proxy/server.mjs"),
            Path::new("/Users/design & review/state"),
            Path::new("/Users/design & review/logs"),
        );
        assert!(plist.contains("/Users/design &amp; review/node"));
        assert!(plist.contains("<key>KeepAlive</key><true/>"));
        assert!(!plist.contains("/bin/sh"));
    }

    #[test]
    fn xml_escape_covers_attribute_and_text_delimiters() {
        assert_eq!(xml_escape("a<&\"'"), "a&lt;&amp;&quot;&apos;");
    }

    #[test]
    fn proxy_health_requires_http_200_and_the_indesign_identity() {
        let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"bridge\":\"indesign\",\"pluginConnected\":false}";
        assert_eq!(
            parse_proxy_health_response(response),
            Some(json!({"bridge":"indesign","pluginConnected":false}))
        );
        assert!(parse_proxy_health_response(
            "HTTP/1.1 503 Unavailable\r\nContent-Type: application/json\r\n\r\n{\"bridge\":\"indesign\"}"
        )
        .is_none());
        assert!(parse_proxy_health_response(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"bridge\":\"illustrator\"}"
        )
        .is_none());
    }

    #[test]
    fn proxy_start_wait_accepts_a_late_health_response_and_times_out() {
        let started = Instant::now();
        assert!(wait_for_proxy_health(Duration::from_secs(4), || {
            started.elapsed() >= Duration::from_millis(3_100)
        }));
        assert!(started.elapsed() >= Duration::from_millis(3_100));

        assert!(!wait_for_proxy_health(Duration::from_millis(30), || false));
    }
}
