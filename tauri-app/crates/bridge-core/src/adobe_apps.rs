use std::{
    cmp::Ordering,
    collections::HashSet,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use plist::Value as PlistValue;
use serde::Serialize;

use crate::model::BridgeId;

const SEARCH_TIMEOUT: Duration = Duration::from_secs(2);
const APP_SEARCH_DEPTH: usize = 4;
const MAX_SEARCH_OUTPUT: usize = 4 * 1024 * 1024;

const REGISTERED_APPS_SCRIPT: &str = r#"
ObjC.import("AppKit");
var workspace = $.NSWorkspace.sharedWorkspace;
var identifiers = ["com.adobe.illustrator", "com.adobe.indesign"];
var result = {};
identifiers.forEach(function(identifier) {
  var urls = workspace.URLsForApplicationsWithBundleIdentifier(identifier);
  var paths = [];
  if (urls) {
    for (var index = 0; index < urls.count; index++) {
      paths.push(ObjC.unwrap(urls.objectAtIndex(index).path));
    }
  }
  result[identifier] = paths;
});
JSON.stringify(result);
"#;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdobeApplication {
    pub path: String,
    pub bundle_id: String,
    pub display_name: String,
    pub version: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct AdobeAppsReport {
    pub applications: Vec<AdobeApplication>,
    pub search_complete: bool,
}

impl AdobeAppsReport {
    #[must_use]
    pub fn applications_for(&self, bridge: BridgeId) -> Vec<AdobeApplication> {
        let expected_id = expected_bundle_id(bridge);
        self.applications
            .iter()
            .filter(|application| application.bundle_id.eq_ignore_ascii_case(expected_id))
            .cloned()
            .collect()
    }

    #[must_use]
    pub fn is_installed(&self, bridge: BridgeId) -> bool {
        self.applications.iter().any(|application| {
            application
                .bundle_id
                .eq_ignore_ascii_case(expected_bundle_id(bridge))
        })
    }
}

#[derive(Debug)]
struct SearchResult {
    paths: Vec<PathBuf>,
    complete: bool,
}

#[must_use]
pub fn discover_adobe_applications() -> AdobeAppsReport {
    let common = search_common_locations();
    let registered = search_registered_apps();
    let spotlight = search_spotlight();
    merge_search_results([common, registered, spotlight])
}

fn merge_search_results(results: [SearchResult; 3]) -> AdobeAppsReport {
    let search_complete = results.iter().all(|result| result.complete);
    let candidates = results
        .into_iter()
        .flat_map(|result| result.paths)
        .collect::<Vec<_>>();
    let applications = collect_adobe_applications(candidates);
    AdobeAppsReport {
        applications,
        search_complete,
    }
}

fn search_common_locations() -> SearchResult {
    let mut complete = true;
    let mut mounted_volumes = Vec::new();
    let volumes = Path::new("/Volumes");
    if volumes.is_dir() {
        match std::fs::read_dir(volumes) {
            Ok(entries) => {
                for entry in entries {
                    match entry {
                        Ok(entry) if entry.path().is_dir() => {
                            mounted_volumes.push(entry.path());
                        }
                        Ok(_) => {}
                        Err(_) => complete = false,
                    }
                }
            }
            Err(_) => complete = false,
        }
    }

    let roots = application_search_roots(dirs::home_dir(), mounted_volumes);
    let mut paths = Vec::new();
    for root in roots {
        let (mut found, root_complete) = scan_application_root(&root);
        paths.append(&mut found);
        complete &= root_complete;
    }
    SearchResult { paths, complete }
}

fn application_search_roots(home: Option<PathBuf>, mounted_volumes: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Some(home) = home {
        roots.push(home.join("Applications"));
    }
    roots.extend(
        mounted_volumes
            .into_iter()
            .map(|volume| volume.join("Applications")),
    );
    roots
}

fn scan_application_root(root: &Path) -> (Vec<PathBuf>, bool) {
    if !root.exists() {
        return (Vec::new(), true);
    }

    let mut found = Vec::new();
    let mut complete = true;
    let mut directories = vec![(root.to_path_buf(), 0_usize)];
    while let Some((directory, depth)) = directories.pop() {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            complete = false;
            continue;
        };

        for entry in entries {
            let Ok(entry) = entry else {
                complete = false;
                continue;
            };
            let Ok(file_type) = entry.file_type() else {
                complete = false;
                continue;
            };
            let path = entry.path();
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }

            let is_app_bundle = path
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("app"));
            let Ok(metadata) = std::fs::metadata(&path) else {
                complete = false;
                continue;
            };
            if is_app_bundle {
                if metadata.is_dir() {
                    found.push(path);
                }
                continue;
            }

            if depth < APP_SEARCH_DEPTH && metadata.is_dir() && !file_type.is_symlink() {
                directories.push((path, depth + 1));
            }
        }
    }
    (found, complete)
}

fn search_registered_apps() -> SearchResult {
    let mut command = Command::new("/usr/bin/osascript");
    command.args(["-l", "JavaScript", "-e", REGISTERED_APPS_SCRIPT]);
    let result = run_command(&mut command, SEARCH_TIMEOUT);
    match result.and_then(|output| parse_registered_output(&output)) {
        Ok(paths) => SearchResult {
            paths,
            complete: true,
        },
        Err(()) => SearchResult {
            paths: Vec::new(),
            complete: false,
        },
    }
}

fn parse_registered_output(output: &[u8]) -> Result<Vec<PathBuf>, ()> {
    let value = serde_json::from_slice::<serde_json::Value>(output).map_err(|_| ())?;
    let illustrator = value
        .get("com.adobe.illustrator")
        .and_then(serde_json::Value::as_array)
        .ok_or(())?
        .iter()
        .filter_map(serde_json::Value::as_str)
        .map(PathBuf::from);
    let indesign = value
        .get("com.adobe.indesign")
        .and_then(serde_json::Value::as_array)
        .ok_or(())?
        .iter()
        .filter_map(serde_json::Value::as_str)
        .map(PathBuf::from);
    Ok(illustrator.chain(indesign).collect())
}

fn search_spotlight() -> SearchResult {
    let query = "(kMDItemCFBundleIdentifier == \"com.adobe.illustrator\"cd || kMDItemCFBundleIdentifier == \"com.adobe.indesign\"cd)";
    let mut command = Command::new("/usr/bin/mdfind");
    command.args(["-0", query]);
    let Ok(output) = run_command(&mut command, SEARCH_TIMEOUT) else {
        return SearchResult {
            paths: Vec::new(),
            complete: false,
        };
    };
    match parse_spotlight_output(&output) {
        Ok(paths) => SearchResult {
            paths,
            complete: true,
        },
        Err(()) => SearchResult {
            paths: Vec::new(),
            complete: false,
        },
    }
}

fn parse_spotlight_output(output: &[u8]) -> Result<Vec<PathBuf>, ()> {
    output
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| std::str::from_utf8(path).map(PathBuf::from).map_err(|_| ()))
        .collect()
}

fn run_command(command: &mut Command, timeout: Duration) -> Result<Vec<u8>, ()> {
    command.stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = command.spawn().map_err(|_| ())?;
    let stdout = child.stdout.take().ok_or(())?;
    let (sender, receiver) = mpsc::channel();
    let reader = thread::spawn(move || {
        let mut output = Vec::new();
        let read_result = stdout
            .take((MAX_SEARCH_OUTPUT + 1) as u64)
            .read_to_end(&mut output);
        let _ = sender.send((output, read_result.is_ok()));
    });

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let (output, read_succeeded) = receiver
                    .recv_timeout(Duration::from_millis(250))
                    .map_err(|_| ())?;
                let _ = reader.join();
                if !status.success() || !read_succeeded || output.len() > MAX_SEARCH_OUTPUT {
                    return Err(());
                }
                return Ok(output);
            }
            Ok(None) if started.elapsed() < timeout => {
                thread::sleep(Duration::from_millis(25));
            }
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = receiver.recv_timeout(Duration::from_millis(250));
                let _ = reader.join();
                return Err(());
            }
        }
    }
}

fn collect_adobe_applications(
    candidates: impl IntoIterator<Item = PathBuf>,
) -> Vec<AdobeApplication> {
    let mut seen = HashSet::new();
    let mut applications = candidates
        .into_iter()
        .filter_map(|path| read_adobe_application(&path))
        .filter(|application| seen.insert(application.path.clone()))
        .collect::<Vec<_>>();
    applications.sort_by(compare_applications);
    applications
}

fn read_adobe_application(path: &Path) -> Option<AdobeApplication> {
    let canonical_path = path.canonicalize().ok()?;
    if !canonical_path.is_dir() {
        return None;
    }
    let plist = PlistValue::from_file(canonical_path.join("Contents/Info.plist")).ok()?;
    let values = plist.as_dictionary()?;
    let bundle_id = values
        .get("CFBundleIdentifier")
        .and_then(PlistValue::as_string)?
        .to_owned();
    let product_name = match_bundle_id(&bundle_id)?;
    let display_name = ["CFBundleDisplayName", "CFBundleName"]
        .into_iter()
        .find_map(|key| values.get(key).and_then(PlistValue::as_string))
        .map_or_else(|| product_name.to_owned(), str::to_owned);
    if is_beta_application(&bundle_id, &display_name, &canonical_path) {
        return None;
    }
    let executable_name = values
        .get("CFBundleExecutable")
        .and_then(PlistValue::as_string)?;
    let executable = canonical_path.join("Contents/MacOS").join(executable_name);
    if !executable.is_file() {
        return None;
    }

    let version = values
        .get("CFBundleShortVersionString")
        .or_else(|| values.get("CFBundleVersion"))
        .and_then(PlistValue::as_string)
        .map(str::to_owned);
    Some(AdobeApplication {
        path: canonical_path.to_string_lossy().into_owned(),
        bundle_id,
        display_name,
        version,
    })
}

fn is_beta_application(bundle_id: &str, display_name: &str, path: &Path) -> bool {
    let bundle_name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    bundle_id.to_ascii_lowercase().ends_with(".beta")
        || display_name.to_ascii_lowercase().contains("beta")
        || bundle_name.contains("beta")
}

fn match_bundle_id(bundle_id: &str) -> Option<&'static str> {
    if bundle_id.eq_ignore_ascii_case(expected_bundle_id(BridgeId::Illustrator)) {
        Some("Adobe Illustrator")
    } else if bundle_id.eq_ignore_ascii_case(expected_bundle_id(BridgeId::Indesign)) {
        Some("Adobe InDesign")
    } else {
        None
    }
}

const fn expected_bundle_id(bridge: BridgeId) -> &'static str {
    match bridge {
        BridgeId::Illustrator => "com.adobe.illustrator",
        BridgeId::Indesign => "com.adobe.indesign",
    }
}

fn compare_applications(left: &AdobeApplication, right: &AdobeApplication) -> Ordering {
    let version_order = match (&left.version, &right.version) {
        (Some(left), Some(right)) => compare_versions(left, right),
        (Some(_), None) => Ordering::Greater,
        (None, Some(_)) => Ordering::Less,
        (None, None) => Ordering::Equal,
    };
    version_order
        .reverse()
        .then_with(|| left.path.cmp(&right.path))
}

fn compare_versions(left: &str, right: &str) -> Ordering {
    let left_parts = version_parts(left);
    let right_parts = version_parts(right);
    left_parts.cmp(&right_parts)
}

fn version_parts(version: &str) -> Vec<u64> {
    version
        .split('.')
        .map(|part| {
            let digits = part
                .chars()
                .take_while(char::is_ascii_digit)
                .collect::<String>();
            digits.parse().unwrap_or(0)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        cmp::Ordering,
        collections::BTreeMap,
        fs,
        path::{Path, PathBuf},
        process::Command,
        time::{Duration, Instant},
    };

    use uuid::Uuid;

    use super::{
        application_search_roots, collect_adobe_applications, compare_versions,
        merge_search_results, parse_registered_output, parse_spotlight_output,
        scan_application_root, AdobeApplication, SearchResult,
    };
    use crate::model::BridgeId;

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!("adobe-app-search-{}", Uuid::new_v4()))
    }

    fn make_app(
        root: &Path,
        directory: &str,
        bundle_id: &str,
        version: &str,
        executable: &str,
    ) -> PathBuf {
        let app = root.join(directory);
        let contents = app.join("Contents");
        let macos = contents.join("MacOS");
        fs::create_dir_all(&macos).expect("app fixture directories should be created");
        let properties = BTreeMap::from([
            ("CFBundleIdentifier", bundle_id),
            ("CFBundleName", "Adobe Fixture App"),
            ("CFBundleDisplayName", "Adobe Fixture App"),
            ("CFBundleExecutable", executable),
            ("CFBundleShortVersionString", version),
        ]);
        plist::to_file_xml(contents.join("Info.plist"), &properties)
            .expect("app fixture Info.plist should be written");
        fs::write(macos.join(executable), "fixture executable")
            .expect("app fixture executable should be written");
        app
    }

    #[test]
    fn finds_year_nested_apps_and_skips_non_bundle_parent_directories() {
        let root = temp_root();
        let illustrator_root = root.join("Applications/Adobe Illustrator 2026");
        let indesign_root = root.join("Applications/Adobe InDesign 2026");
        make_app(
            &illustrator_root,
            "Renamed Illustrator.app",
            "com.adobe.illustrator",
            "30.3.0",
            "Illustrator",
        );
        make_app(
            &indesign_root,
            "Renamed InDesign.app",
            "com.adobe.InDesign",
            "21.0.0.192",
            "InDesign",
        );

        let (paths, complete) = scan_application_root(&root.join("Applications"));
        let applications = collect_adobe_applications(paths);
        assert!(complete);
        assert_eq!(applications.len(), 2);
        assert_eq!(applications[0].bundle_id, "com.adobe.illustrator");
        assert_eq!(applications[1].bundle_id, "com.adobe.InDesign");
        assert_eq!(applications[0].display_name, "Adobe Fixture App");
        assert_eq!(applications[0].version.as_deref(), Some("30.3.0"));

        fs::remove_dir_all(root).expect("fixture tree should be removed");
    }

    #[test]
    fn searches_standard_user_and_mounted_volume_application_roots() {
        let home = PathBuf::from("/Users/example");
        let volumes = vec![PathBuf::from("/Volumes/Design Drive")];
        let roots = application_search_roots(Some(home), volumes);

        assert_eq!(
            roots,
            vec![
                PathBuf::from("/Applications"),
                PathBuf::from("/Users/example/Applications"),
                PathBuf::from("/Volumes/Design Drive/Applications"),
            ]
        );
    }

    #[test]
    fn discovers_all_2020_to_2026_versions_and_future_versions_without_a_year_gate() {
        let root = temp_root();
        let applications_root = root.join("Applications");
        let illustrator_versions = [
            "24.0", "25.0", "26.0", "27.0", "28.0", "29.0", "30.0", "31.0",
        ];
        let indesign_versions = [
            "15.0", "16.0", "17.0", "18.0", "19.0", "20.0", "21.0", "22.0",
        ];
        for (year_offset, (illustrator_version, indesign_version)) in illustrator_versions
            .into_iter()
            .zip(indesign_versions)
            .enumerate()
        {
            let year = 2020 + year_offset;
            let illustrator_folder = format!("Adobe Illustrator {year}/Adobe Illustrator.app");
            let indesign_folder = format!("Adobe InDesign {year}/Adobe InDesign {year}.app");
            let illustrator_executable = "Adobe Illustrator";
            let indesign_executable = format!("Adobe InDesign {year}");
            make_app(
                &applications_root,
                &illustrator_folder,
                "com.adobe.illustrator",
                illustrator_version,
                illustrator_executable,
            );
            make_app(
                &applications_root,
                &indesign_folder,
                "com.adobe.indesign",
                indesign_version,
                &indesign_executable,
            );
        }

        let (paths, complete) = scan_application_root(&applications_root);
        let applications = collect_adobe_applications(paths);
        assert!(complete);
        assert_eq!(applications.len(), 16);
        assert_eq!(applications[0].version.as_deref(), Some("31.0"));
        assert_eq!(
            applications
                .iter()
                .filter(|app| app.bundle_id == "com.adobe.illustrator")
                .count(),
            8
        );
        assert_eq!(
            applications
                .iter()
                .filter(|app| app.bundle_id == "com.adobe.indesign")
                .count(),
            8
        );

        fs::remove_dir_all(root).expect("fixture tree should be removed");
    }

    #[test]
    fn deduplicates_symlinks_and_rejects_corrupt_beta_and_helper_bundles() {
        let root = temp_root();
        let apps = root.join("Applications");
        let good = make_app(
            &apps,
            "Original.app",
            "com.adobe.illustrator",
            "30.9",
            "Illustrator",
        );
        #[cfg(unix)]
        std::os::unix::fs::symlink(&good, apps.join("Alias.app"))
            .expect("fixture alias should be created");
        let beta = make_app(
            &apps,
            "Illustrator Beta.app",
            "com.adobe.illustrator",
            "31.0",
            "Beta",
        );
        let helper = make_app(
            &apps,
            "InDesign Helper.app",
            "com.adobe.indesign.helper",
            "99.0",
            "Helper",
        );
        let corrupt = apps.join("Damaged.app");
        fs::create_dir_all(corrupt.join("Contents/MacOS"))
            .expect("damaged app directory should be created");
        fs::write(corrupt.join("Contents/Info.plist"), "not a plist")
            .expect("damaged app Info.plist should be written");
        let missing_binary = make_app(
            &apps,
            "Missing Binary.app",
            "com.adobe.indesign",
            "22.0",
            "Missing",
        );
        fs::remove_file(missing_binary.join("Contents/MacOS/Missing"))
            .expect("fixture executable should be removed");

        let (paths, _) = scan_application_root(&apps);
        let applications = collect_adobe_applications(paths);
        assert_eq!(applications.len(), 1);
        assert_eq!(
            applications[0].path,
            good.canonicalize().unwrap().display().to_string()
        );
        assert!(beta.exists());
        assert!(helper.exists());

        fs::remove_dir_all(root).expect("fixture tree should be removed");
    }

    #[test]
    fn user_location_results_merge_with_registered_and_spotlight_results() {
        let root = temp_root();
        let local = make_app(
            &root.join("User Applications"),
            "Local.app",
            "com.adobe.illustrator",
            "30.0",
            "AI",
        );
        let registered = make_app(
            &root.join("Registered"),
            "Registered.app",
            "com.adobe.indesign",
            "21.0",
            "ID",
        );
        let spotlight = make_app(
            &root.join("Spotlight"),
            "Spotlight.app",
            "com.adobe.indesign",
            "20.0",
            "ID",
        );
        let report = merge_search_results([
            SearchResult {
                paths: vec![local.clone()],
                complete: true,
            },
            SearchResult {
                paths: vec![registered.clone()],
                complete: false,
            },
            SearchResult {
                paths: vec![spotlight.clone()],
                complete: true,
            },
        ]);

        assert!(!report.search_complete);
        assert_eq!(report.applications.len(), 3);
        assert_eq!(report.applications_for(BridgeId::Illustrator).len(), 1);
        assert_eq!(report.applications_for(BridgeId::Indesign).len(), 2);
        assert!(report.is_installed(BridgeId::Illustrator));

        fs::remove_dir_all(root).expect("fixture tree should be removed");
    }

    #[test]
    fn sorts_versions_by_numeric_components_and_paths_stably() {
        assert_eq!(compare_versions("30.10", "30.9"), Ordering::Greater);
        let mut applications = [
            fake_app("/z", Some("30.9")),
            fake_app("/unknown", None),
            fake_app("/a", Some("30.10")),
            fake_app("/b", Some("30.10")),
        ];
        applications.sort_by(super::compare_applications);
        assert_eq!(applications[0].path, "/a");
        assert_eq!(applications[1].path, "/b");
        assert_eq!(applications[2].path, "/z");
        assert_eq!(applications[3].path, "/unknown");
    }

    #[test]
    fn command_timeout_kills_the_search_process() {
        let mut command = Command::new("/usr/bin/sleep");
        command.arg("1");
        let started = Instant::now();
        assert!(super::run_command(&mut command, Duration::from_millis(30)).is_err());
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn registered_and_spotlight_results_parse_success_and_reject_invalid_output() {
        let registered = parse_registered_output(
            br#"{"com.adobe.illustrator":["/Applications/Illustrator.app"],"com.adobe.indesign":["/Applications/InDesign.app"]}"#,
        )
        .expect("valid application registration JSON should parse");
        assert_eq!(registered.len(), 2);
        assert!(parse_registered_output(b"not json").is_err());
        assert!(parse_registered_output(br#"{"com.adobe.illustrator":[]}"#).is_err());

        let spotlight = parse_spotlight_output(
            b"/Applications/Illustrator.app\0/Volumes/Design/InDesign.app\0",
        )
        .expect("NUL-delimited Spotlight paths should parse");
        assert_eq!(spotlight.len(), 2);
        assert!(parse_spotlight_output(b"/Applications/Illustrator.app\0\xff").is_err());
    }

    #[test]
    fn an_incomplete_empty_search_is_distinct_from_an_installation() {
        let empty_report = merge_search_results([
            SearchResult {
                paths: Vec::new(),
                complete: true,
            },
            SearchResult {
                paths: Vec::new(),
                complete: false,
            },
            SearchResult {
                paths: Vec::new(),
                complete: true,
            },
        ]);

        assert!(!empty_report.search_complete);
        assert!(!empty_report.is_installed(BridgeId::Illustrator));

        let installed_report = merge_search_results([
            SearchResult {
                paths: Vec::new(),
                complete: true,
            },
            SearchResult {
                paths: Vec::new(),
                complete: true,
            },
            SearchResult {
                paths: Vec::new(),
                complete: true,
            },
        ]);
        assert!(installed_report.search_complete);
    }

    fn fake_app(path: &str, version: Option<&str>) -> AdobeApplication {
        AdobeApplication {
            path: path.to_owned(),
            bundle_id: "com.adobe.illustrator".to_owned(),
            display_name: "Adobe Illustrator".to_owned(),
            version: version.map(str::to_owned),
        }
    }
}
