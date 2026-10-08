use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    diagnostics::application_support_dir,
    model::{ActionResult, BridgeId, InstallReport},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleManifest {
    bridge_id: BridgeId,
    version: String,
    files: BTreeMap<String, String>,
}

#[must_use]
pub fn install_all_bridges(resource_dir: &Path) -> InstallReport {
    let stopped = crate::service::stop_indesign_proxy();
    if !stopped.ok {
        return InstallReport {
            installed_bridges: Vec::new(),
            runtime_result: stopped,
            proxy_result: None,
        };
    }

    let install_result = (|| {
        install_shared_node(resource_dir)?;
        install_launcher(resource_dir)?;
        let mut installed = Vec::new();
        let mut failures = Vec::new();
        for bridge in [BridgeId::Illustrator, BridgeId::Indesign] {
            match install_bundle(bridge, resource_dir) {
                Ok(path) => installed.push((bridge, path.version)),
                Err(error) => failures.push(format!("{}: {error}", bridge.label())),
            }
        }
        Ok::<_, InstallError>((installed, failures))
    })();

    let proxy_result = crate::service::start_indesign_proxy();
    match install_result {
        Ok((installed, failures)) => {
            let runtime_result = if failures.is_empty() {
                ActionResult::success(
                    "BRIDGES_INSTALLED",
                    format!(
                        "Installed {}.",
                        installed
                            .iter()
                            .map(|(bridge, version)| format!("{} {version}", bridge.label()))
                            .collect::<Vec<_>>()
                            .join(" and ")
                    ),
                    "Restart or reload the selected clients to load the full tool lists.",
                )
            } else {
                ActionResult::failure(
                    "BRIDGE_INSTALL_INCOMPLETE",
                    format!(
                        "Installed: {}. Issues: {}",
                        installed
                            .iter()
                            .map(|(bridge, version)| format!("{} {version}", bridge.label()))
                            .collect::<Vec<_>>()
                            .join(", "),
                        failures.join("; ")
                    ),
                    "Run Install / Update again after correcting the reported runtime issue.",
                )
            };
            InstallReport {
                installed_bridges: installed.into_iter().map(|(bridge, _)| bridge).collect(),
                runtime_result,
                proxy_result: Some(proxy_result),
            }
        }
        Err(error) => InstallReport {
            installed_bridges: Vec::new(),
            runtime_result: ActionResult::failure(
                "BRIDGE_INSTALL_FAILED",
                format!("The shared runtime could not be installed: {error}"),
                "Run Install / Update again after correcting the reported runtime issue.",
            ),
            proxy_result: Some(proxy_result),
        },
    }
}

fn remove_managed_tree(path: &Path) -> Result<(), InstallError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            fs::remove_dir_all(path)?;
            Ok(())
        }
        Ok(_) => Err(InstallError::UnsafeCurrentPath),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

struct InstallPath {
    version: String,
}

fn install_bundle(bridge: BridgeId, resource_dir: &Path) -> Result<InstallPath, InstallError> {
    install_bundle_at(bridge, resource_dir, &application_support_dir())
}

fn install_bundle_at(
    bridge: BridgeId,
    resource_dir: &Path,
    support_dir: &Path,
) -> Result<InstallPath, InstallError> {
    let source = resource_dir.join("bridges").join(bridge.as_str());
    let manifest_path = source.join("bridge-runtime.json");
    let manifest: BundleManifest = serde_json::from_slice(
        &fs::read(&manifest_path).map_err(|_| InstallError::MissingBundle(bridge))?,
    )?;
    if manifest.bridge_id != bridge || !is_safe_version(&manifest.version) {
        return Err(InstallError::InvalidManifest);
    }
    validate_bundle(&source, &manifest)?;

    let root = support_dir.join("runtimes").join(bridge.as_str());
    create_private_directory_tree(&root)?;
    let versions = root.join("versions");
    create_private_directory_tree(&versions)?;
    let staging = versions.join(format!(".staging-{}", Uuid::new_v4()));
    let installed_name = format!("{}-install-{}", manifest.version, Uuid::new_v4());
    let final_dir = versions.join(&installed_name);
    fs::create_dir(&staging)?;
    set_private_permissions(&staging)?;
    let copy_result =
        copy_bundle(&source, &staging, &manifest).and_then(|()| verify_bundle(&staging, &manifest));
    if let Err(error) = copy_result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    fs::rename(&staging, &final_dir)?;

    if let Err(error) = switch_current_link(&root, "versions", &installed_name) {
        let _ = remove_managed_tree(&final_dir);
        return Err(error);
    }
    remove_old_versions(&versions, &installed_name)?;
    Ok(InstallPath {
        version: manifest.version,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SharedRuntimeManifest {
    version: String,
    files: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct LauncherManifest {
    version: String,
    sha256: String,
}

fn install_shared_node(resource_dir: &Path) -> Result<(), InstallError> {
    install_shared_node_at(resource_dir, &application_support_dir())
}

fn install_shared_node_at(resource_dir: &Path, support_dir: &Path) -> Result<(), InstallError> {
    let source = resource_dir.join("shared/node");
    let manifest: SharedRuntimeManifest =
        serde_json::from_slice(&fs::read(source.join("node-runtime.json"))?)?;
    if !is_safe_version(&manifest.version) {
        return Err(InstallError::InvalidManifest);
    }
    validate_file_map(&source, &manifest.files)?;

    let root = support_dir.join("shared/node");
    create_private_directory_tree(&root)?;
    let versions = root.join("versions");
    create_private_directory_tree(&versions)?;
    let staging = versions.join(format!(".staging-{}", Uuid::new_v4()));
    let installed_name = format!("{}-install-{}", manifest.version, Uuid::new_v4());
    let final_dir = versions.join(&installed_name);
    fs::create_dir(&staging)?;
    set_private_permissions(&staging)?;
    for (relative, expected_hash) in &manifest.files {
        let input = safe_join(&source, relative)?;
        let output = safe_join(&staging, relative)?;
        if let Some(parent) = output.parent() {
            create_private_directory_tree(parent)?;
        }
        let executable = has_executable_bit(&input)?;
        fs::copy(&input, &output)?;
        set_private_file_permissions(&output, executable)?;
        if hash_file(&output)? != *expected_hash {
            let _ = fs::remove_dir_all(&staging);
            return Err(InstallError::IntegrityFailure(relative.clone()));
        }
    }
    fs::copy(
        source.join("node-runtime.json"),
        staging.join("node-runtime.json"),
    )?;
    fs::rename(&staging, &final_dir)?;
    switch_current_link(&root, "versions", &installed_name)?;
    remove_old_versions(&versions, &installed_name)?;
    Ok(())
}

fn remove_old_versions(versions: &Path, active_version: &str) -> Result<(), InstallError> {
    for entry in fs::read_dir(versions)? {
        let entry = entry?;
        if entry.file_name() == active_version {
            continue;
        }
        remove_managed_tree(&entry.path())?;
    }
    Ok(())
}

fn install_launcher(resource_dir: &Path) -> Result<(), InstallError> {
    let source_root = resource_dir.join("bridge-tools");
    let manifest: LauncherManifest =
        serde_json::from_slice(&fs::read(source_root.join("bridge-tools.json"))?)?;
    if !is_safe_version(&manifest.version) {
        return Err(InstallError::InvalidManifest);
    }
    let source = source_root.join("adobe-mcp-launcher");
    let source_metadata = fs::symlink_metadata(&source)?;
    if !source_metadata.is_file() || source_metadata.file_type().is_symlink() {
        return Err(InstallError::InvalidManifest);
    }
    if hash_file(&source)? != manifest.sha256 {
        return Err(InstallError::IntegrityFailure(
            "adobe-mcp-launcher".to_owned(),
        ));
    }
    let bin_dir = application_support_dir().join("bin");
    create_private_directory_tree(&bin_dir)?;
    let destination = bin_dir.join("adobe-mcp-launcher");
    let temporary = bin_dir.join(format!(".adobe-mcp-launcher-{}", Uuid::new_v4()));
    fs::copy(source, &temporary)?;
    set_private_file_permissions(&temporary, true)?;
    if let Err(error) = fs::rename(&temporary, &destination) {
        let _ = fs::remove_file(&temporary);
        return Err(error.into());
    }
    sync_directory(&bin_dir)?;
    Ok(())
}

fn validate_file_map(root: &Path, files: &BTreeMap<String, String>) -> Result<(), InstallError> {
    for (relative, expected_hash) in files {
        let path = safe_join(root, relative)?;
        let metadata = fs::symlink_metadata(&path)?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || hash_file(&path)? != *expected_hash
        {
            return Err(InstallError::IntegrityFailure(relative.clone()));
        }
    }
    Ok(())
}

fn switch_current_link(root: &Path, version_root: &str, version: &str) -> Result<(), InstallError> {
    let current = root.join("current");
    let temporary_link = root.join(format!(".current-{}", Uuid::new_v4()));
    #[cfg(unix)]
    std::os::unix::fs::symlink(Path::new(version_root).join(version), &temporary_link)?;
    if fs::symlink_metadata(&current).is_ok_and(|metadata| !metadata.file_type().is_symlink()) {
        let _ = fs::remove_file(&temporary_link);
        return Err(InstallError::UnsafeCurrentPath);
    }
    fs::rename(&temporary_link, &current)?;
    sync_directory(root)?;
    Ok(())
}

fn validate_bundle(source: &Path, manifest: &BundleManifest) -> Result<(), InstallError> {
    for (relative, expected_hash) in &manifest.files {
        let path = safe_join(source, relative)?;
        let metadata = fs::symlink_metadata(&path)?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || hash_file(&path)? != *expected_hash
        {
            return Err(InstallError::IntegrityFailure(relative.clone()));
        }
    }
    Ok(())
}

fn verify_bundle(destination: &Path, manifest: &BundleManifest) -> Result<(), InstallError> {
    let installed: BundleManifest =
        serde_json::from_slice(&fs::read(destination.join("bridge-runtime.json"))?)?;
    if installed.bridge_id != manifest.bridge_id
        || installed.version != manifest.version
        || installed.files != manifest.files
    {
        return Err(InstallError::IntegrityFailure(
            "bridge-runtime.json".to_owned(),
        ));
    }
    validate_bundle(destination, &installed)
}

fn copy_bundle(
    source: &Path,
    destination: &Path,
    manifest: &BundleManifest,
) -> Result<(), InstallError> {
    for relative in manifest.files.keys() {
        let input = safe_join(source, relative)?;
        let output = safe_join(destination, relative)?;
        if let Some(parent) = output.parent() {
            create_private_directory_tree(parent)?;
        }
        let executable = has_executable_bit(&input)?;
        let mut reader = File::open(&input)?;
        let mut writer = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)?;
        std::io::copy(&mut reader, &mut writer)?;
        writer.sync_all()?;
        set_private_file_permissions(&output, executable)?;
        if hash_file(&output)? != manifest.files[relative] {
            return Err(InstallError::IntegrityFailure(relative.clone()));
        }
    }
    let manifest_bytes = fs::read(source.join("bridge-runtime.json"))?;
    let manifest_output = destination.join("bridge-runtime.json");
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&manifest_output)?;
    file.write_all(&manifest_bytes)?;
    file.sync_all()?;
    set_private_file_permissions(&manifest_output, false)?;
    Ok(())
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, InstallError> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(InstallError::InvalidManifest);
    }
    Ok(root.join(relative_path))
}

pub(crate) fn create_private_directory_tree(path: &Path) -> Result<(), InstallError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if current.exists() || fs::symlink_metadata(&current).is_ok() {
            let metadata = fs::symlink_metadata(&current)?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(InstallError::UnsafeCurrentPath);
            }
        } else {
            fs::create_dir(&current)?;
            set_private_permissions(&current)?;
        }
    }
    Ok(())
}

fn set_private_permissions(path: &Path) -> Result<(), InstallError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

pub(crate) fn set_private_file_permissions(
    path: &Path,
    executable: bool,
) -> Result<(), InstallError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            path,
            fs::Permissions::from_mode(if executable { 0o700 } else { 0o600 }),
        )?;
    }
    #[cfg(not(unix))]
    let _ = executable;
    Ok(())
}

fn has_executable_bit(path: &Path) -> Result<bool, InstallError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        Ok(fs::symlink_metadata(path)?.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(false)
    }
}

fn hash_file(path: &Path) -> Result<String, InstallError> {
    let mut file = File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024].into_boxed_slice();
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn is_safe_version(version: &str) -> bool {
    !version.is_empty()
        && version
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_".contains(character))
}

fn sync_directory(path: &Path) -> Result<(), InstallError> {
    File::open(path)?.sync_all()?;
    Ok(())
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum InstallError {
    #[error("The bundled runtime for {0:?} is not present in this application build.")]
    MissingBundle(BridgeId),
    #[error("The bundled runtime manifest is invalid.")]
    InvalidManifest,
    #[error("Runtime integrity verification failed for {0}.")]
    IntegrityFailure(String),
    #[error("A managed runtime path contains a symbolic link or unexpected file.")]
    UnsafeCurrentPath,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[cfg(test)]
mod tests {
    use super::{
        hash_file, install_bundle_at, remove_managed_tree, remove_old_versions,
        switch_current_link, InstallError,
    };
    use crate::model::BridgeId;
    use serde_json::json;
    use std::{fs, path::PathBuf};
    use uuid::Uuid;

    fn temporary_path(label: &str) -> PathBuf {
        fs::canonicalize(std::env::temp_dir())
            .expect("temporary directory should resolve")
            .join(format!("adobe-ai-bridge-{label}-{}", Uuid::new_v4()))
    }

    fn write_bundle_fixture(root: &std::path::Path, version: &str, contents: &str) {
        let source = root.join("bridges/illustrator");
        fs::create_dir_all(&source).expect("bundle fixture directory should be created");
        let payload = source.join("payload.bin");
        fs::write(&payload, contents).expect("bundle fixture payload should be written");
        let manifest = json!({
            "bridgeId": "illustrator",
            "version": version,
            "files": { "payload.bin": hash_file(&payload).unwrap() }
        });
        fs::write(
            source.join("bridge-runtime.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .expect("bundle fixture manifest should be written");
    }

    #[cfg(unix)]
    #[test]
    fn runtime_cleanup_refuses_to_follow_a_symlinked_directory() {
        use std::os::unix::fs::symlink;

        let root = temporary_path("runtime-link");
        let target = temporary_path("runtime-target");
        fs::create_dir_all(&target).expect("temporary target should be created");
        fs::write(target.join("keep.txt"), "preserve").expect("target fixture should be written");
        symlink(&target, &root).expect("symlink fixture should be created");
        assert!(matches!(
            remove_managed_tree(&root),
            Err(InstallError::UnsafeCurrentPath)
        ));
        assert_eq!(
            fs::read_to_string(target.join("keep.txt")).unwrap(),
            "preserve"
        );
        fs::remove_file(root).expect("symlink fixture should be removed");
        fs::remove_dir_all(target).expect("target fixture should be removed");
    }

    #[cfg(unix)]
    #[test]
    fn runtime_update_switches_current_then_prunes_the_previous_version() {
        use std::os::unix::fs::symlink;

        let root = temporary_path("runtime-update");
        let versions = root.join("versions");
        fs::create_dir_all(versions.join("1.0.0-install-old"))
            .expect("old runtime fixture should be created");
        fs::create_dir_all(versions.join("1.0.0-install-new"))
            .expect("new runtime fixture should be created");
        symlink("versions/1.0.0-install-old", root.join("current"))
            .expect("old active pointer should be created");

        switch_current_link(&root, "versions", "1.0.0-install-new")
            .expect("runtime pointer should switch");
        remove_old_versions(&versions, "1.0.0-install-new").expect("old version should be pruned");

        assert_eq!(
            fs::read_link(root.join("current")).unwrap(),
            PathBuf::from("versions/1.0.0-install-new")
        );
        assert!(versions.join("1.0.0-install-new").is_dir());
        assert!(!versions.join("1.0.0-install-old").exists());
        fs::remove_dir_all(root).expect("temporary runtime root should be removed");
    }

    #[cfg(unix)]
    #[test]
    fn bundle_install_replaces_same_version_and_prunes_upgraded_versions() {
        let resource = temporary_path("bundle-source");
        let support = temporary_path("bundle-support");
        write_bundle_fixture(&resource, "1.0.0", "first install");

        let first = install_bundle_at(BridgeId::Illustrator, &resource, &support)
            .expect("initial bundle install should pass");
        let root = support.join("runtimes/illustrator");
        let versions = root.join("versions");
        let first_current = root.join("current").canonicalize().unwrap();
        assert_eq!(
            fs::read(first_current.join("payload.bin")).unwrap(),
            b"first install"
        );
        assert_eq!(first.version, "1.0.0");
        assert_eq!(fs::read_dir(&versions).unwrap().count(), 1);

        write_bundle_fixture(&resource, "1.0.0", "same-version replacement");
        install_bundle_at(BridgeId::Illustrator, &resource, &support)
            .expect("same-version reinstall should copy the complete bundle");
        let replacement_current = root.join("current").canonicalize().unwrap();
        assert_ne!(first_current, replacement_current);
        assert_eq!(
            fs::read(replacement_current.join("payload.bin")).unwrap(),
            b"same-version replacement"
        );
        assert_eq!(fs::read_dir(&versions).unwrap().count(), 1);

        write_bundle_fixture(&resource, "2.0.0", "upgraded runtime");
        let upgraded = install_bundle_at(BridgeId::Illustrator, &resource, &support)
            .expect("upgraded bundle should install");
        let upgraded_current = root.join("current").canonicalize().unwrap();
        assert_eq!(upgraded.version, "2.0.0");
        assert_eq!(
            fs::read(upgraded_current.join("payload.bin")).unwrap(),
            b"upgraded runtime"
        );
        assert_eq!(fs::read_dir(&versions).unwrap().count(), 1);
        fs::remove_dir_all(resource).expect("bundle fixture should be removed");
        fs::remove_dir_all(support).expect("runtime fixture should be removed");
    }
}
