#!/usr/bin/env python3
"""Verify the checked-in upstream snapshot and fetch its pinned release artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
from urllib.request import Request, urlopen
from zipfile import BadZipFile, ZipFile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = ROOT.parent
PIN_FILE = ROOT / "runtime" / "pins.lock.json"
UPSTREAM_DIR = ROOT / "runtime" / ".cache" / "upstreams" / "indesign"
ARCHIVE_DIR = UPSTREAM_DIR / "archives"
PROXY_SOURCE_DIR = UPSTREAM_DIR / "adb-proxy-socket"
SNAPSHOT_DIR = REPOSITORY_ROOT / "indesign-mcp"
HEADERS = {"User-Agent": "adobe-ai-bridge-pinned-upstream-audit/0.1.0"}


def verify_source_snapshot(snapshot_dir: Path, expected_files: dict[str, str]) -> None:
    if not snapshot_dir.is_dir():
        raise SystemExit(f"The tracked InDesign upstream snapshot is missing: {snapshot_dir}")

    for relative in expected_files:
        path = PurePosixPath(relative)
        if path.is_absolute() or ".." in path.parts or not path.parts:
            raise SystemExit(f"Refusing unsafe path in the InDesign snapshot manifest: {relative}")

    paths = list(snapshot_dir.rglob("*"))
    if any(path.is_symlink() for path in paths):
        raise SystemExit("Refusing a symlink in the checked-in InDesign snapshot.")
    expected_paths = set(expected_files)
    actual_paths = {path.relative_to(snapshot_dir).as_posix() for path in paths if path.is_file()}
    if actual_paths != expected_paths:
        missing = sorted(expected_paths - actual_paths)
        unexpected = sorted(actual_paths - expected_paths)
        raise SystemExit(f"InDesign snapshot file inventory mismatch; missing={missing}, unexpected={unexpected}")

    for relative, expected_digest in expected_files.items():
        path = snapshot_dir / relative
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != expected_digest:
            raise SystemExit(
                f"InDesign snapshot hash mismatch for {relative}: expected {expected_digest}, got {digest}. "
                "Review the upstream change and update pins.lock.json with the manual snapshot sync."
            )
    print(f"Verified checked-in InDesign snapshot: {len(expected_files)} files")


def download(url: str) -> bytes:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=45) as response:
        return response.read()


def write_verified_archive(name: str, metadata: dict[str, str]) -> Path:
    data = download(metadata["url"])
    digest = hashlib.sha256(data).hexdigest()
    if digest != metadata["sha256"]:
        raise SystemExit(f"SHA-256 mismatch for {name}: expected {metadata['sha256']}, got {digest}")
    destination = ARCHIVE_DIR / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    print(f"Verified {name}: sha256={digest} size={len(data)}")
    return destination


def extract_verified_zip(archive_path: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    try:
        with ZipFile(archive_path) as archive:
            for member in archive.infolist():
                path = PurePosixPath(member.filename)
                if path.is_absolute() or ".." in path.parts or not path.parts:
                    raise SystemExit(f"Refusing unsafe upstream archive path: {member.filename}")
                output = destination.joinpath(*path.parts)
                if member.is_dir():
                    output.mkdir(parents=True, exist_ok=True)
                    continue
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(archive.read(member))
    except BadZipFile as exc:
        raise SystemExit(f"Upstream artifact is not a valid ZIP archive: {archive_path.name}") from exc


def fetch_proxy_sources(commit: str) -> None:
    base = f"https://raw.githubusercontent.com/mikechambers/adb-mcp/{commit}"
    files = (
        "LICENSE.md",
        "adb-proxy-socket/package.json",
        "adb-proxy-socket/package-lock.json",
        "adb-proxy-socket/proxy.js",
    )
    for relative in files:
        source = download(f"{base}/{relative}")
        if not source:
            raise SystemExit(f"Empty pinned source file: {relative}")
        parts = PurePosixPath(relative).parts
        destination = UPSTREAM_DIR.joinpath(*parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source)
        print(f"Pinned {relative}: sha256={hashlib.sha256(source).hexdigest()}")


def main() -> None:
    pins = json.loads(PIN_FILE.read_text(encoding="utf-8"))
    verify_source_snapshot(SNAPSHOT_DIR, pins["rinnellasky"]["snapshotFiles"])
    dxt = write_verified_archive("indesign-mcp.dxt", pins["rinnellasky"]["artifacts"]["indesign-mcp.dxt"])
    ccx = write_verified_archive("indesign-mcp-plugin.ccx", pins["rinnellasky"]["artifacts"]["indesign-mcp-plugin.ccx"])
    extract_verified_zip(dxt, UPSTREAM_DIR / "indesign-mcp")
    extract_verified_zip(ccx, UPSTREAM_DIR / "indesign-mcp-plugin")
    fetch_proxy_sources(pins["adbProxy"]["commit"])
    print(f"Verified checked-in upstream snapshot and pinned release artifacts into {UPSTREAM_DIR}")


if __name__ == "__main__":
    main()
