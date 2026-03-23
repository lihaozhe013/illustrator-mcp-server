use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    diagnostics::application_support_dir,
    model::{ActionResult, BridgeId},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleManifest {
    bridge_id: BridgeId,
    version: String,
    files: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeInstallResult {
    pub result: ActionResult,
    pub installed_path: Option<String>,
}

#[must_use]
pub fn install_bridge(bridge: BridgeId, resource_dir: &Path) -> BridgeInstallResult {
    match install_bundle(bridge, resource_dir) {
        Ok(path) => BridgeInstallResult {
            result: ActionResult::success("RUNTIME_INSTALLED", format!("{} runtime {} is installed.", bridge.label(), path.version), "The previous version remains available for rollback."),
            installed_path: Some(path.current.display().to_string()),
        },
        Err(error) => BridgeInstallResult {
            result: ActionResult::failure("RUNTIME_INSTALL_FAILED", error.to_string(), "Review the bundled runtime manifest and retry. The current version was not switched."),
            installed_path: None,
        },
    }
}

#[must_use]
pub fn rollback_bridge(bridge: BridgeId) -> ActionResult {
    match rollback_bundle(bridge) {
        Ok((from, to)) => ActionResult::success(
            "RUNTIME_ROLLED_BACK",
            format!("{} runtime switched from {from} to {to}.", bridge.label()),
            "The version that was active before rollback remains installed.",
        ),
        Err(error) => ActionResult::failure(
            "RUNTIME_ROLLBACK_FAILED",
            error.to_string(),
            "The currently active runtime was left in place.",
        ),
    }
}

#[must_use]
pub fn uninstall_bridge(bridge: BridgeId) -> ActionResult {
    if bridge == BridgeId::Indesign {
        let stopped = crate::service::stop_indesign_proxy();
        if !stopped.ok {
            return stopped;
        }
        if let Err(error) =
            remove_managed_file(&application_support_dir().join("state/indesign.token"))
        {
            return ActionResult::failure(
                "INDESIGN_TOKEN_CLEANUP_FAILED",
                error.to_string(),
                "The proxy is stopped. Inspect the protected InDesign token file before retrying uninstall.",
            );
        }
    }
    let support = application_support_dir();
    let bridge_root = support.join("runtimes").join(bridge.as_str());
    if let Err(error) = remove_managed_tree(&bridge_root) {
        return ActionResult::failure(
            "RUNTIME_UNINSTALL_FAILED",
            error.to_string(),
            "The bridge runtime could not be removed safely; inspect its Application Support directory.",
        );
    }

    let another_bridge_is_installed = [BridgeId::Illustrator, BridgeId::Indesign]
        .into_iter()
        .filter(|candidate| *candidate != bridge)
        .any(|candidate| {
            let current = support
                .join("runtimes")
                .join(candidate.as_str())
                .join("current");
            fs::symlink_metadata(current).is_ok_and(|metadata| metadata.file_type().is_symlink())
        });
    if !another_bridge_is_installed {
        if let Err(error) = remove_managed_tree(&support.join("shared/node")) {
            return ActionResult::failure(
                "SHARED_RUNTIME_CLEANUP_FAILED",
                error.to_string(),
                "The selected bridge was removed, but shared Node could not be cleaned up safely.",
            );
        }
        let launcher = support.join("bin/adobe-mcp-launcher");
        match fs::symlink_metadata(&launcher) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                if fs::remove_file(&launcher).is_err() {
                    return ActionResult::failure(
                        "SHARED_RUNTIME_CLEANUP_FAILED",
                        "The last bridge runtime was removed, but the managed launcher could not be removed.",
                        "Remove the Adobe AI Bridge launcher from its Application Support bin directory after closing clients.",
                    );
                }
            }
            Ok(_) => {
                return ActionResult::failure(
                    "SHARED_RUNTIME_OWNERSHIP_CONFLICT",
                    "The launcher path is not a regular file and was left untouched.",
                    "Inspect the launcher path before removing shared manager files.",
                )
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                return ActionResult::failure(
                    "SHARED_RUNTIME_CLEANUP_FAILED",
                    "The launcher could not be inspected safely.",
                    "Check Application Support permissions and retry.",
                )
            }
        }
    }
    ActionResult::success(
        "RUNTIME_UNINSTALLED",
        format!("{} runtime files were removed.", bridge.label()),
        "Client configuration entries are preserved. Remove them separately with the configuration preview if desired.",
    )
}

fn rollback_bundle(bridge: BridgeId) -> Result<(String, String), InstallError> {
    let root = application_support_dir()
        .join("runtimes")
        .join(bridge.as_str());
    let versions = root.join("versions");
    let current_version = current_version(&root)?;
    let mut candidates = Vec::new();
    for entry in fs::read_dir(&versions)? {
        let entry = entry?;
        let metadata = fs::symlink_metadata(entry.path())?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            continue;
        }
        let version = entry.file_name().to_string_lossy().into_owned();
        if version == current_version || !is_safe_version(&version) {
            continue;
        }
        let manifest: BundleManifest =
            serde_json::from_slice(&fs::read(entry.path().join("bridge-runtime.json"))?)?;
        if manifest.bridge_id != bridge || manifest.version != version {
            continue;
        }
        validate_bundle(&entry.path(), &manifest)?;
        candidates.push((
            metadata.modified().unwrap_or(std::time::UNIX_EPOCH),
            version,
        ));
    }
    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.0));
    let Some((_, target_version)) = candidates.into_iter().next() else {
        return Err(InstallError::NoRollbackVersion(bridge));
    };
    switch_current_link(&root, "versions", &target_version)?;
    Ok((current_version, target_version))
}

fn current_version(root: &Path) -> Result<String, InstallError> {
    let current = root.join("current");
    let metadata = fs::symlink_metadata(&current)?;
    if !metadata.file_type().is_symlink() {
        return Err(InstallError::UnsafeCurrentPath);
    }
    let target = fs::read_link(current)?;
    let components: Vec<_> = target.components().collect();
    if components.len() != 2 || components[0] != std::path::Component::Normal("versions".as_ref()) {
        return Err(InstallError::UnsafeCurrentPath);
    }
    let version = components[1]
        .as_os_str()
        .to_str()
        .ok_or(InstallError::InvalidManifest)?;
    if !is_safe_version(version) {
        return Err(InstallError::InvalidManifest);
    }
    Ok(version.to_owned())
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

fn remove_managed_file(path: &Path) -> Result<(), InstallError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            fs::remove_file(path)?;
            Ok(())
        }
        Ok(_) => Err(InstallError::UnsafeCurrentPath),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

struct InstallPath {
    current: PathBuf,
    version: String,
}

fn install_bundle(bridge: BridgeId, resource_dir: &Path) -> Result<InstallPath, InstallError> {
    install_shared_node(resource_dir)?;
    install_launcher(resource_dir)?;
    let source = resource_dir.join("bridges").join(bridge.as_str());
    let manifest_path = source.join("bridge-runtime.json");
    let manifest: BundleManifest = serde_json::from_slice(
        &fs::read(&manifest_path).map_err(|_| InstallError::MissingBundle(bridge))?,
    )?;
    if manifest.bridge_id != bridge || !is_safe_version(&manifest.version) {
        return Err(InstallError::InvalidManifest);
    }
    validate_bundle(&source, &manifest)?;

    let root = application_support_dir()
        .join("runtimes")
        .join(bridge.as_str());
    create_private_directory_tree(&root)?;
    let versions = root.join("versions");
    create_private_directory_tree(&versions)?;
    let final_dir = versions.join(&manifest.version);
    if final_dir.exists() {
        verify_bundle(&final_dir, &manifest)?;
    } else {
        let staging = versions.join(format!(".staging-{}", Uuid::new_v4()));
        fs::create_dir(&staging)?;
        set_private_permissions(&staging)?;
        let copy_result = copy_bundle(&source, &staging, &manifest);
        if let Err(error) = copy_result {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
        fs::rename(&staging, &final_dir)?;
    }

    let current = root.join("current");
    let temporary_link = root.join(format!(".current-{}", Uuid::new_v4()));
    #[cfg(unix)]
    std::os::unix::fs::symlink(
        Path::new("versions").join(&manifest.version),
        &temporary_link,
    )?;
    if fs::symlink_metadata(&current).is_ok_and(|metadata| !metadata.file_type().is_symlink()) {
        let _ = fs::remove_file(&temporary_link);
        return Err(InstallError::UnsafeCurrentPath);
    }
    fs::rename(&temporary_link, &current)?;
    sync_directory(&root)?;
    Ok(InstallPath {
        current,
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
    let source = resource_dir.join("shared/node");
    let manifest: SharedRuntimeManifest =
        serde_json::from_slice(&fs::read(source.join("node-runtime.json"))?)?;
    if !is_safe_version(&manifest.version) {
        return Err(InstallError::InvalidManifest);
    }
    validate_file_map(&source, &manifest.files)?;

    let root = application_support_dir().join("shared/node");
    create_private_directory_tree(&root)?;
    let versions = root.join("versions");
    create_private_directory_tree(&versions)?;
    let final_dir = versions.join(&manifest.version);
    if final_dir.exists() {
        validate_file_map(&final_dir, &manifest.files)?;
    } else {
        let staging = versions.join(format!(".staging-{}", Uuid::new_v4()));
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
    }
    switch_current_link(&root, "versions", &manifest.version)?;
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
    #[error("No earlier installed {0:?} runtime is available for rollback.")]
    NoRollbackVersion(BridgeId),
    #[error("A managed runtime path contains a symbolic link or unexpected file.")]
    UnsafeCurrentPath,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[cfg(test)]
mod tests {
    use super::{current_version, remove_managed_tree, InstallError};
    use std::{fs, path::PathBuf};
    use uuid::Uuid;

    fn temporary_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("adobe-ai-bridge-{label}-{}", Uuid::new_v4()))
    }

    #[cfg(unix)]
    #[test]
    fn current_runtime_link_must_stay_under_the_versions_directory() {
        use std::os::unix::fs::symlink;

        let root = temporary_path("current-link");
        fs::create_dir_all(&root).expect("temporary runtime root should be created");
        symlink("versions/1.2.3", root.join("current")).expect("managed link should be created");
        assert_eq!(current_version(&root).unwrap(), "1.2.3");
        fs::remove_file(root.join("current")).expect("managed link should be removed");
        symlink("versions/../../outside", root.join("current"))
            .expect("unsafe link fixture should be created");
        assert!(matches!(
            current_version(&root),
            Err(InstallError::UnsafeCurrentPath)
        ));
        fs::remove_dir_all(root).expect("temporary runtime root should be removed");
    }

    #[cfg(unix)]
    #[test]
    fn uninstall_refuses_to_follow_a_symlinked_runtime_directory() {
        use std::os::unix::fs::symlink;

        let root = temporary_path("uninstall-link");
        let target = temporary_path("uninstall-target");
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
}
