#!/usr/bin/env python3
"""Build hash-verified arm64 runtime resources for the Tauri application."""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import select
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

APP_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = APP_ROOT.parent
RUNTIME = APP_ROOT / "runtime"
BUNDLES = RUNTIME / "bundles"
BUILD = RUNTIME / "build"
PINS = json.loads((RUNTIME / "pins.lock.json").read_text(encoding="utf-8"))


def run(args: list[str], *, cwd: Path = APP_ROOT) -> None:
    subprocess.run(args, cwd=cwd, check=True)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def remove_generated(path: Path) -> None:
    resolved = path.resolve()
    allowed_roots = (BUNDLES.resolve(), BUILD.resolve())
    if not any(root == resolved or root in resolved.parents for root in allowed_roots):
        raise SystemExit(f"Refusing to remove generated output outside runtime/bundles: {path}")
    if path.is_symlink():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def download_node() -> tuple[Path, str]:
    pin = PINS["nodeRuntime"]
    cache_dir = RUNTIME / ".cache" / "downloads"
    cache_dir.mkdir(parents=True, exist_ok=True)
    archive = cache_dir / f"node-v{pin['version']}-darwin-arm64.tar.gz"
    if archive.exists():
        actual = sha256(archive.read_bytes())
        if actual != pin["sha256"]:
            raise SystemExit(f"Cached Node archive checksum mismatch: {actual}")
    else:
        request = urllib.request.Request(pin["url"], headers={"User-Agent": "Adobe-AI-Bridge-runtime-builder"})
        with urllib.request.urlopen(request, timeout=90) as response, archive.open("xb") as destination:
            shutil.copyfileobj(response, destination)
        actual = sha256(archive.read_bytes())
        if actual != pin["sha256"]:
            archive.unlink(missing_ok=True)
            raise SystemExit(f"Downloaded Node archive checksum mismatch: {actual}")
    return archive, pin["version"]


def install_node_runtime() -> None:
    archive, version = download_node()
    destination = BUNDLES / "shared" / "node"
    remove_generated(destination)
    bin_dir = destination / "bin"
    bin_dir.mkdir(parents=True)
    expected_root = f"node-v{version}-darwin-arm64"
    with tarfile.open(archive, "r:gz") as package:
        node_member = package.getmember(f"{expected_root}/bin/node")
        license_member = package.getmember(f"{expected_root}/LICENSE")
        if not node_member.isfile() or not license_member.isfile():
            raise SystemExit("The pinned Node archive has an unexpected layout.")
        node_file = package.extractfile(node_member)
        license_file = package.extractfile(license_member)
        if node_file is None or license_file is None:
            raise SystemExit("The pinned Node runtime or license could not be read.")
        (bin_dir / "node").write_bytes(node_file.read())
        (destination / "NOTICE-node.md").write_bytes(license_file.read())
    os.chmod(bin_dir / "node", 0o755)
    write_hash_manifest(destination, "node-runtime.json", {"version": version})
    version_output = subprocess.check_output([str(bin_dir / "node"), "--version"], text=True).strip()
    if version_output != f"v{version}":
        raise SystemExit(f"Bundled Node version check failed: {version_output}")


def build_illustrator_runtime() -> None:
    from build_illustrator_sources import prepare_sources

    source = REPOSITORY_ROOT / "illustrator-mcp"
    version = PINS["illustrator"]["packageVersion"]
    package = json.loads((source / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != version:
        raise SystemExit("The tracked Illustrator source version differs from the pinned snapshot.")
    patched_source = prepare_sources()
    upstream_dependencies = source / "node_modules"
    if not upstream_dependencies.is_dir():
        raise SystemExit("Install the pinned Illustrator development dependencies before bundling.")
    os.symlink(upstream_dependencies, patched_source / "node_modules", target_is_directory=True)
    run(["npm", "run", "build"], cwd=patched_source)
    verify_illustrator_stdio(patched_source / "dist/bundle.cjs")

    destination = BUNDLES / "bridges" / "illustrator"
    remove_generated(destination)
    destination.mkdir(parents=True)
    shutil.copytree(patched_source / "dist", destination / "dist")
    shutil.copy2(source / "LICENSE", destination / "LICENSE")
    shutil.copy2(RUNTIME / "locks/illustrator/package.json", destination / "package.json")
    shutil.copy2(RUNTIME / "locks/illustrator/package-lock.json", destination / "package-lock.json")
    run(["npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], cwd=destination)
    run(["npm", "audit", "--omit=dev"], cwd=destination)
    shutil.rmtree(destination / "node_modules/.bin", ignore_errors=True)
    write_npm_notices(destination)
    write_hash_manifest(
        destination,
        "bridge-runtime.json",
        {"bridgeId": "illustrator", "version": PINS["illustrator"]["managerRuntimeVersion"]},
    )


def write_npm_notices(root: Path) -> None:
    rows = ["# Illustrator Runtime Dependency Notices", "", "This runtime uses production dependencies from the manager-owned, security-updated lockfile.", ""]
    package_files = sorted((root / "node_modules").rglob("package.json"))
    for package_file in package_files:
        try:
            package = json.loads(package_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        name = package.get("name")
        if not name:
            continue
        license_id = package.get("license", "License metadata unavailable")
        rows.append(f"- `{name}@{package.get('version', 'unknown')}` — {license_id}")
    (root / "THIRD_PARTY_NOTICES.md").write_text("\n".join(rows) + "\n", encoding="utf-8")


def prepare_indesign_source() -> Path:
    from fetch_upstream import verify_source_snapshot

    verify_source_snapshot(REPOSITORY_ROOT / "indesign-mcp", PINS["rinnellasky"]["snapshotFiles"])
    staged = RUNTIME / "build" / "indesign" / "indesign-mcp"
    if not (staged / "id_mcp.py").is_file():
        run([sys.executable, "scripts/fetch_upstream.py"])
        run([sys.executable, "scripts/build_indesign_sources.py"])
    return staged


def build_indesign_runtime() -> None:
    version = PINS["rinnellasky"]["managerPackage"]["version"]
    source = prepare_indesign_source()
    run([sys.executable, "scripts/build_uxp_package.py"])

    pyinstaller_root = BUILD / "pyinstaller"
    remove_generated(pyinstaller_root)
    pyinstaller_root.mkdir(parents=True)
    wrapper = RUNTIME / "wrappers" / "indesign_mcp_entry.py"
    command = [
        "uv", "run", "--locked", "--project", str(RUNTIME), "pyinstaller",
        "--noconfirm", "--clean", "--onedir", "--name", "adobe-indesign-mcp",
        "--distpath", str(pyinstaller_root / "dist"),
        "--workpath", str(pyinstaller_root / "work"),
        "--specpath", str(pyinstaller_root),
        "--paths", str(source),
        "--collect-all", "mcp",
        "--collect-all", "socketio",
        "--collect-all", "engineio",
        "--collect-all", "PIL",
        "--collect-all", "fontTools",
        "--collect-all", "numpy",
        "--hidden-import", "id_mcp",
        str(wrapper),
    ]
    run(command)
    verify_frozen_indesign_stdio(pyinstaller_root / "dist/adobe-indesign-mcp/adobe-indesign-mcp")

    destination = BUNDLES / "bridges" / "indesign"
    remove_generated(destination)
    destination.mkdir(parents=True)
    shutil.copytree(pyinstaller_root / "dist/adobe-indesign-mcp", destination / "bin")
    proxy_destination = destination / "proxy"
    proxy_destination.mkdir()
    for filename in ("server.mjs", "package.json", "package-lock.json"):
        shutil.copy2(RUNTIME / "proxy" / filename, proxy_destination / filename)
    run(["npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], cwd=proxy_destination)
    run(["npm", "audit", "--omit=dev"], cwd=proxy_destination)
    shutil.rmtree(proxy_destination / "node_modules/.bin", ignore_errors=True)
    shutil.copy2(RUNTIME / "dist/indesign-mcp-plugin.ccx", destination / "indesign-mcp-plugin.ccx")
    shutil.copy2(REPOSITORY_ROOT / "indesign-mcp/LICENSE.md", destination / "LICENSE-indesign-mcp.md")
    with zipfile.ZipFile(destination / "indesign-mcp-plugin.ccx") as plugin_archive:
        plugin_license = plugin_archive.read("LICENSE")
    if b"Apache License" not in plugin_license:
        raise SystemExit("The InDesign UXP package does not contain its expected Apache License 2.0 notice.")
    (destination / "LICENSE-uxp-plugin.txt").write_bytes(plugin_license)
    python_license = subprocess.check_output(
        [
            "uv", "run", "--locked", "--project", str(RUNTIME), "python", "-c",
            "import pathlib,sys; print(pathlib.Path(sys.base_prefix) / 'lib' / f'python{sys.version_info.major}.{sys.version_info.minor}' / 'LICENSE.txt')",
        ],
        cwd=APP_ROOT,
        text=True,
    ).strip()
    if not Path(python_license).is_file():
        raise SystemExit("The pinned Python runtime's PSF license text could not be located.")
    shutil.copy2(python_license, destination / "LICENSE-Python.txt")
    (destination / "UXP-PERMISSIONS.md").write_text(
        "# UXP Permission Notice\n\n"
        "Creative Cloud will ask for user approval. This build limits network access to `http://127.0.0.1:3001`. "
        "The upstream bridge requires `localFileSystem: fullAccess` for its file-backed document and image operations. "
        "The bridge exposes the complete upstream MCP tool set and trusted JSX execution; scripts run with the application's local access. Review the Creative Cloud prompt before accepting it.\n",
        encoding="utf-8",
    )
    write_python_notices(destination)
    write_hash_manifest(destination, "bridge-runtime.json", {"bridgeId": "indesign", "version": version})


def write_python_notices(root: Path) -> None:
    rows = ["# InDesign Runtime Dependency Notices", "", "Versions follow `runtime/uv.lock`. License expressions and included license files were collected from the locked build environment.", ""]
    licenses_root = root / "licenses/python"
    licenses_root.mkdir(parents=True, exist_ok=True)
    for distribution in sorted(importlib.metadata.distributions(), key=lambda item: (item.metadata.get("Name") or "").lower()):
        name = distribution.metadata.get("Name") or "unknown"
        version = distribution.version
        expression = distribution.metadata.get("License-Expression") or distribution.metadata.get("License") or "License metadata unavailable"
        safe_name = "".join(char if char.isalnum() or char in "._-" else "_" for char in f"{name}-{version}")
        included = []
        for file in distribution.files or ():
            filename = Path(str(file)).name
            upper = filename.upper()
            if filename and (upper.startswith("LICENSE") or upper.startswith("COPYING") or upper.startswith("NOTICE")):
                source = distribution.locate_file(file)
                if source.is_file():
                    target_dir = licenses_root / safe_name
                    target_dir.mkdir(parents=True, exist_ok=True)
                    target = target_dir / filename
                    if not target.exists():
                        shutil.copy2(source, target)
                    included.append(target.relative_to(root).as_posix())
        suffix = f"; files: {', '.join(included)}" if included else "; license file not declared in distribution metadata"
        rows.append(f"- `{name}=={version}` — {expression}{suffix}")
    (root / "THIRD_PARTY_NOTICES.md").write_text("\n".join(rows) + "\n", encoding="utf-8")


def verify_frozen_indesign_stdio(executable: Path) -> None:
    requests = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "runtime-bundle-smoke", "version": "0.1.0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    ]
    with tempfile.TemporaryDirectory(prefix="adobe-ai-bridge-runtime-") as temporary:
        home = Path(temporary)
        state = home / "state"
        state.mkdir(mode=0o700)
        environment = {
            "HOME": str(home),
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
            "INDESIGN_BRIDGE_STATE_DIR": str(state),
            "INDESIGN_BRIDGE_TOKEN": "runtime-smoke-token-" + "x" * 40,
            "INDESIGN_BRIDGE_PROXY_URL": "http://127.0.0.1:1",
        }
        process = subprocess.run(
            [str(executable)],
            input="\n".join(json.dumps(request) for request in requests) + "\n",
            capture_output=True,
            check=False,
            env=environment,
            text=True,
            timeout=30,
        )
    if process.returncode != 0:
        raise SystemExit(f"The frozen InDesign MCP failed its isolated stdio smoke test: {process.stderr[-2000:]}")
    try:
        responses = [json.loads(line) for line in process.stdout.splitlines()]
    except json.JSONDecodeError as error:
        raise SystemExit(f"The frozen InDesign MCP wrote non-JSON data to stdout: {error}") from error
    initialized = next((response for response in responses if response.get("id") == 1), None)
    tools = next((response for response in responses if response.get("id") == 2), None)
    if initialized is None or initialized.get("result", {}).get("serverInfo", {}).get("name") != "Adobe InDesign MCP Server":
        raise SystemExit("The frozen InDesign MCP did not complete initialize with the expected server identity.")
    tool_list = tools.get("result", {}).get("tools", []) if tools else []
    names = {tool.get("name") for tool in tool_list}
    if len(names) != 100 or not {"get_document_info", "open_document", "execute_jsx"}.issubset(names):
        raise SystemExit(f"The frozen InDesign MCP did not expose all 100 tools: got {len(names)}.")


def verify_illustrator_stdio(bundle: Path) -> None:
    requests = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "runtime-bundle-smoke", "version": "0.1.0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    ]
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js is required to verify the Illustrator MCP stdio bundle.")
    process = subprocess.run(
        [node, str(bundle)],
        input="\n".join(json.dumps(request) for request in requests) + "\n",
        capture_output=True,
        check=False,
        cwd=bundle.parent.parent,
        text=True,
        timeout=30,
    )
    if process.returncode != 0:
        raise SystemExit(f"The Illustrator MCP failed its isolated stdio smoke test: {process.stderr[-2000:]}")
    try:
        responses = [json.loads(line) for line in process.stdout.splitlines()]
    except json.JSONDecodeError as error:
        raise SystemExit(f"The Illustrator MCP wrote non-JSON data to stdout: {error}") from error
    initialized = next((response for response in responses if response.get("id") == 1), None)
    tools = next((response for response in responses if response.get("id") == 2), None)
    if initialized is None or initialized.get("result", {}).get("serverInfo", {}).get("name") != "illustrator-mcp-server":
        raise SystemExit("The Illustrator MCP did not complete initialize with the expected server identity.")
    tool_list = tools.get("result", {}).get("tools", []) if tools else []
    names = {tool.get("name") for tool in tool_list}
    if len(names) != 67 or not {"get_document_info", "open_document", "execute_jsx"}.issubset(names):
        raise SystemExit(f"The Illustrator MCP did not expose all 67 tools: got {len(names)}.")


def write_hash_manifest(root: Path, filename: str, metadata: dict[str, str]) -> None:
    files = {}
    for path in sorted(root.rglob("*")):
        if path.name == filename or path.is_dir():
            continue
        if path.is_symlink() or not path.is_file():
            raise SystemExit(f"Runtime bundle contains an unsupported non-regular file: {path}")
        relative = path.relative_to(root).as_posix()
        files[relative] = sha256(path.read_bytes())
    manifest = {**metadata, "files": files}
    (root / filename).write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    BUNDLES.mkdir(parents=True, exist_ok=True)
    install_node_runtime()
    build_illustrator_runtime()
    build_indesign_runtime()

    tools_dir = BUNDLES / "bridge-tools"
    remove_generated(tools_dir)
    tools_dir.mkdir(parents=True)
    run(["cargo", "build", "--release", "-p", "adobe-mcp-launcher"])
    launcher = APP_ROOT / "target/release/adobe-mcp-launcher"
    shutil.copy2(launcher, tools_dir / "adobe-mcp-launcher")
    os.chmod(tools_dir / "adobe-mcp-launcher", 0o755)
    manifest = {
        "version": env_build_version(),
        "sha256": sha256((tools_dir / "adobe-mcp-launcher").read_bytes()),
    }
    (tools_dir / "bridge-tools.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    verify_launcher_stdio(tools_dir / "adobe-mcp-launcher")
    print(f"Built both Adobe AI Bridge runtime bundles at {BUNDLES}")


def verify_launcher_stdio(launcher: Path) -> None:
    expected_counts = {"illustrator": 67, "indesign": 100}

    def copy_file(source: str, destination: str) -> str:
        try:
            os.link(source, destination)
            return destination
        except OSError:
            return shutil.copy2(source, destination)

    with tempfile.TemporaryDirectory(prefix="adobe-ai-bridge-launcher-") as temporary:
        home = Path(temporary)
        support = home / "Library/Application Support/AdobeAIBridge"
        node_source = BUNDLES / "shared/node"
        node_root = support / "shared/node"
        node_versions = node_root / "versions"
        node_versions.mkdir(parents=True)
        node_name = "launcher-smoke"
        shutil.copytree(node_source, node_versions / node_name, copy_function=copy_file)
        os.symlink(Path("versions") / node_name, node_root / "current")

        state = support / "state"
        state.mkdir(parents=True)
        token = state / "indesign.token"
        token.write_text("launcher-smoke-token-" + "x" * 40, encoding="utf-8")
        os.chmod(token, 0o600)

        for bridge, expected_count in expected_counts.items():
            source = BUNDLES / "bridges" / bridge
            runtime_root = support / "runtimes" / bridge
            versions = runtime_root / "versions"
            versions.mkdir(parents=True)
            runtime_name = "launcher-smoke"
            shutil.copytree(source, versions / runtime_name, copy_function=copy_file)
            os.symlink(Path("versions") / runtime_name, runtime_root / "current")
            environment = os.environ.copy()
            environment.update({"HOME": str(home), "PATH": "/usr/bin:/bin:/usr/sbin:/sbin"})
            process = subprocess.Popen(
                [str(launcher), "--bridge", bridge],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=environment,
                text=True,
            )
            assert process.stdin is not None and process.stdout is not None and process.stderr is not None
            responses = []

            def request(message: dict[str, object]) -> dict[str, object]:
                process.stdin.write(json.dumps(message) + "\n")
                process.stdin.flush()
                ready, _, _ = select.select([process.stdout], [], [], 10)
                if not ready:
                    process.kill()
                    raise SystemExit(f"The {bridge} launcher timed out waiting for MCP response {message.get('id')}.")
                line = process.stdout.readline()
                if not line:
                    process.kill()
                    raise SystemExit(f"The {bridge} launcher closed stdout before MCP response {message.get('id')}.")
                try:
                    response = json.loads(line)
                except json.JSONDecodeError as error:
                    process.kill()
                    raise SystemExit(f"The {bridge} launcher wrote non-JSON stdout: {line!r}") from error
                if response.get("jsonrpc") != "2.0" or response.get("id") != message.get("id"):
                    process.kill()
                    raise SystemExit(f"The {bridge} launcher returned an unexpected MCP response: {response!r}")
                responses.append(response)
                return response

            initialized = request(
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "launcher-bundle-smoke", "version": "0.1.0"},
                    },
                }
            )
            process.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
            process.stdin.flush()
            tools = request({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
            hidden_call = request(
                {
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {"name": "open_document", "arguments": {}},
                }
            )
            process.stdin.close()
            try:
                return_code = process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                raise SystemExit(f"The {bridge} launcher did not exit after its MCP client closed.")
            stderr = process.stderr.read()
            if return_code != 0:
                raise SystemExit(f"The {bridge} MCP failed through the packaged launcher: {stderr[-2000:]}")
            if any(response.get("jsonrpc") != "2.0" for response in responses):
                raise SystemExit(f"The {bridge} launcher emitted a non-MCP stdout line.")
            names = {
                tool.get("name")
                for tool in (tools or {}).get("result", {}).get("tools", [])
            }
            if len(names) != expected_count:
                raise SystemExit(f"The {bridge} launcher exposed {len(names)} tools; expected {expected_count}.")
            if not {"open_document", "execute_jsx"}.issubset(names):
                raise SystemExit(f"The {bridge} launcher hid a required open or JSX tool.")
            if hidden_call is None or hidden_call.get("error") is not None or not hidden_call.get("result", {}).get("isError"):
                raise SystemExit(
                    f"The {bridge} launcher did not forward the hidden open_document call: "
                    f"{json.dumps(hidden_call, ensure_ascii=False)}; stderr={stderr[-1000:]}"
                )


def env_build_version() -> str:
    return json.loads((APP_ROOT / "package.json").read_text(encoding="utf-8"))["version"]


if __name__ == "__main__":
    main()
