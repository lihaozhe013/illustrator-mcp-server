use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use plist::Value as PlistValue;

use crate::model::DetectedClients;

const DETECTION_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_APP_SEARCH_DEPTH: usize = 4;

#[must_use]
pub fn detect_clients() -> DetectedClients {
    let home = dirs::home_dir().unwrap_or_default();
    let roots = [PathBuf::from("/Applications"), home.join("Applications")];
    let executables = opencode_executable_candidates(&home);
    detect_clients_in(&roots, &executables, DETECTION_TIMEOUT)
}

fn detect_clients_in(
    roots: &[PathBuf],
    opencode_executables: &[PathBuf],
    timeout: Duration,
) -> DetectedClients {
    let deadline = Instant::now() + timeout;
    let mut detected = DetectedClients {
        opencode: opencode_executables.iter().any(|path| is_executable(path)),
        workbuddy: false,
    };

    for root in roots {
        if Instant::now() >= deadline {
            break;
        }
        search_applications(root, deadline, &mut detected);
    }

    detected
}

fn search_applications(root: &Path, deadline: Instant, detected: &mut DetectedClients) {
    let mut directories = vec![(root.to_path_buf(), 0_usize)];
    while let Some((directory, depth)) = directories.pop() {
        if Instant::now() >= deadline || (detected.opencode && detected.workbuddy) {
            return;
        }
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };

        for entry in entries {
            if Instant::now() >= deadline || (detected.opencode && detected.workbuddy) {
                return;
            }
            let Ok(entry) = entry else {
                continue;
            };
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }

            if path.extension().is_some_and(|extension| extension == "app") {
                if let Some(identifier) = app_bundle_identifier(&path) {
                    match identifier {
                        "com.tencent.workbuddy.mac" => detected.workbuddy = true,
                        "ai.opencode.desktop"
                        | "ai.opencode.desktop.beta"
                        | "ai.opencode.desktop.dev" => detected.opencode = true,
                        _ => {}
                    }
                }
                continue;
            }

            if depth < MAX_APP_SEARCH_DEPTH {
                directories.push((path, depth + 1));
            }
        }
    }
}

fn app_bundle_identifier(app: &Path) -> Option<&'static str> {
    let info = PlistValue::from_file(app.join("Contents/Info.plist")).ok()?;
    let identifier = info
        .as_dictionary()?
        .get("CFBundleIdentifier")?
        .as_string()?;
    match identifier {
        "com.tencent.workbuddy.mac" => Some("com.tencent.workbuddy.mac"),
        "ai.opencode.desktop" => Some("ai.opencode.desktop"),
        "ai.opencode.desktop.beta" => Some("ai.opencode.desktop.beta"),
        "ai.opencode.desktop.dev" => Some("ai.opencode.desktop.dev"),
        _ => None,
    }
}

fn opencode_executable_candidates(home: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|directory| directory.join("opencode")));
    }
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/opencode"),
        PathBuf::from("/usr/local/bin/opencode"),
        home.join(".bun/bin/opencode"),
        home.join(".local/bin/opencode"),
        home.join(".opencode/bin/opencode"),
        home.join(".volta/bin/opencode"),
        home.join(".npm/bin/opencode"),
        home.join("bin/opencode"),
    ]);
    candidates
}

fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::{detect_clients_in, PlistValue};
    use crate::model::DetectedClients;
    use std::{
        fs::{self, Permissions},
        os::unix::fs::PermissionsExt,
        path::PathBuf,
        time::Duration,
    };
    use uuid::Uuid;

    fn temporary_root() -> PathBuf {
        std::env::temp_dir().join(format!("adobe-ai-bridge-clients-{}", Uuid::new_v4()))
    }

    fn write_app(root: &std::path::Path, name: &str, identifier: &str) -> PathBuf {
        let info = root.join(name).join("Contents/Info.plist");
        fs::create_dir_all(info.parent().unwrap()).unwrap();
        let mut dictionary = plist::Dictionary::new();
        dictionary.insert(
            "CFBundleIdentifier".to_owned(),
            PlistValue::String(identifier.to_owned()),
        );
        plist::to_file_xml(&info, &PlistValue::Dictionary(dictionary)).unwrap();
        info.parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf()
    }

    #[test]
    fn detects_only_installed_clients_and_does_not_use_config_files() {
        let root = temporary_root();
        let applications = root.join("Applications");
        write_app(&applications, "WorkBuddy.app", "com.tencent.workbuddy.mac");
        fs::create_dir_all(root.join(".workbuddy")).unwrap();
        fs::write(root.join(".workbuddy/mcp.json"), "{}").unwrap();

        let detected = detect_clients_in(&[applications], &[], Duration::from_secs(1));

        assert_eq!(
            detected,
            DetectedClients {
                opencode: false,
                workbuddy: true
            }
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn detects_opencode_cli_from_a_common_user_install_path() {
        let root = temporary_root();
        let executable = root.join(".bun/bin/opencode");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::write(&executable, "fixture").unwrap();
        fs::set_permissions(&executable, Permissions::from_mode(0o700)).unwrap();

        let detected = detect_clients_in(&[], &[executable], Duration::from_secs(1));

        assert_eq!(
            detected,
            DetectedClients {
                opencode: true,
                workbuddy: false
            }
        );
        fs::remove_dir_all(root).unwrap();
    }
}
