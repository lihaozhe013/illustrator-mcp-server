"""Check manual upstream snapshot verification and failure handling."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = PROJECT_ROOT.parent
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "fetch_upstream.py"
SPEC = importlib.util.spec_from_file_location("fetch_upstream", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
FETCH_UPSTREAM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FETCH_UPSTREAM)


def test_checked_in_snapshot_matches_manifest() -> None:
    pins = json.loads((PROJECT_ROOT / "runtime" / "pins.lock.json").read_text(encoding="utf-8"))
    FETCH_UPSTREAM.verify_source_snapshot(REPOSITORY_ROOT / "indesign-mcp", pins["rinnellasky"]["snapshotFiles"])


def test_snapshot_verifier_rejects_changed_and_unlisted_files(tmp_path: Path) -> None:
    source = tmp_path / "README.md"
    source.write_text("reviewed snapshot", encoding="utf-8")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    FETCH_UPSTREAM.verify_source_snapshot(tmp_path, {"README.md": digest})

    source.write_text("changed snapshot", encoding="utf-8")
    with pytest.raises(SystemExit, match="snapshot hash mismatch"):
        FETCH_UPSTREAM.verify_source_snapshot(tmp_path, {"README.md": digest})

    source.write_text("reviewed snapshot", encoding="utf-8")
    (tmp_path / "unexpected.txt").write_text("unreviewed", encoding="utf-8")
    with pytest.raises(SystemExit, match="file inventory mismatch"):
        FETCH_UPSTREAM.verify_source_snapshot(tmp_path, {"README.md": digest})


def test_snapshot_verifier_rejects_symlinks_and_unsafe_manifest_paths(tmp_path: Path) -> None:
    source = tmp_path / "README.md"
    source.write_text("reviewed snapshot", encoding="utf-8")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    link = tmp_path / "linked.md"
    link.symlink_to(source)
    with pytest.raises(SystemExit, match="symlink"):
        FETCH_UPSTREAM.verify_source_snapshot(tmp_path, {"README.md": digest})

    link.unlink()
    with pytest.raises(SystemExit, match="unsafe path"):
        FETCH_UPSTREAM.verify_source_snapshot(tmp_path, {"../outside": digest})
