#!/usr/bin/env python3
"""Verify the built DMG, bundled resource hashes, licenses, and arm64 binaries."""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str]) -> str:
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)


def verify_manifest(resource_root: Path, manifest_name: str, expected_id: str | None = None) -> None:
    manifest = json.loads((resource_root / manifest_name).read_text(encoding="utf-8"))
    if expected_id is not None and manifest.get("bridgeId") != expected_id:
        raise SystemExit(f"Unexpected bridge ID in {resource_root / manifest_name}.")
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        raise SystemExit(f"Missing file hash map in {resource_root / manifest_name}.")
    root = resource_root.resolve()
    for relative, expected_hash in files.items():
        source = resource_root / relative
        item = source.resolve()
        if root not in item.parents or source.is_symlink() or not item.is_file():
            raise SystemExit(f"Unsafe or missing packaged resource: {relative}")
        actual_hash = hashlib.sha256(item.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise SystemExit(f"Packaged resource checksum mismatch: {relative}")
    print(f"Verified {resource_root.name}: {len(files)} resources")


def verify_arm64(path: Path) -> None:
    description = run(["/usr/bin/file", "-b", str(path)]).strip()
    details = description.split()
    if not description.startswith("Mach-O ") or "arm64" not in details or "universal" in details:
        raise SystemExit(f"Expected a thin arm64 binary at {path}; got {description}.")


def verify_dmg(dmg: Path) -> None:
    if not dmg.is_file():
        raise SystemExit(f"DMG does not exist: {dmg}")
    run(["/usr/bin/hdiutil", "verify", str(dmg)])
    with tempfile.TemporaryDirectory(prefix="adobe-ai-bridge-dmg-") as temporary:
        mountpoint = Path(temporary) / "mount"
        mountpoint.mkdir()
        run([
            "/usr/sbin/diskutil", "image", "attach", "--readOnly", "--mountOptions", "nobrowse",
            "--mountPoint", str(mountpoint), str(dmg),
        ])
        try:
            applications = list(mountpoint.glob("*.app"))
            if len(applications) != 1:
                raise SystemExit("The DMG must contain exactly one Adobe AI Bridge application.")
            app = applications[0]
            resources = app / "Contents/Resources"
            verify_manifest(resources / "bridges/illustrator", "bridge-runtime.json", "illustrator")
            verify_manifest(resources / "bridges/indesign", "bridge-runtime.json", "indesign")
            verify_manifest(resources / "shared/node", "node-runtime.json")

            launcher_root = resources / "bridge-tools"
            launcher_manifest = json.loads(
                (launcher_root / "bridge-tools.json").read_text(encoding="utf-8")
            )
            launcher = launcher_root / "adobe-mcp-launcher"
            if hashlib.sha256(launcher.read_bytes()).hexdigest() != launcher_manifest.get("sha256"):
                raise SystemExit("The bundled stable launcher checksum does not match its manifest.")

            required_files = [
                resources / "bridges/illustrator/LICENSE",
                resources / "bridges/illustrator/THIRD_PARTY_NOTICES.md",
                resources / "bridges/indesign/LICENSE-indesign-mcp.md",
                resources / "bridges/indesign/LICENSE-uxp-plugin.txt",
                resources / "bridges/indesign/LICENSE-Python.txt",
                resources / "bridges/indesign/THIRD_PARTY_NOTICES.md",
                resources / "shared/node/NOTICE-node.md",
            ]
            missing = [str(path.relative_to(resources)) for path in required_files if not path.is_file()]
            if missing:
                raise SystemExit(f"Missing bundled license or notice files: {', '.join(missing)}")

            for binary in (
                app / "Contents/MacOS/adobe-ai-bridge-desktop",
                launcher,
                resources / "shared/node/bin/node",
                resources / "bridges/indesign/bin/adobe-indesign-mcp",
            ):
                verify_arm64(binary)
            print("Verified single-app DMG, licenses, launcher, and arm64 runtime binaries")
        finally:
            subprocess.run(
                ["/usr/bin/hdiutil", "detach", str(mountpoint)],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )


def main() -> None:
    config = json.loads(
        (APP_ROOT / "apps/desktop/src-tauri/tauri.conf.json").read_text(encoding="utf-8")
    )
    version = config.get("version")
    if not isinstance(version, str):
        raise SystemExit("The Tauri config does not define a string app version.")
    images = sorted(
        (APP_ROOT / "target/release/bundle/dmg").glob(
            f"Adobe AI Bridge_{version}_aarch64.dmg"
        )
    )
    if len(images) != 1:
        raise SystemExit(
            f"Expected exactly one Apple Silicon Adobe AI Bridge {version} DMG in the release output directory."
        )
    verify_dmg(images[0])


if __name__ == "__main__":
    main()
