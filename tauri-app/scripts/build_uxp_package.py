#!/usr/bin/env python3
"""Build the token-authenticated UXP plugin from the hash-pinned upstream CCX."""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / "runtime" / "pins.lock.json").read_text(encoding="utf-8"))
SOURCE = ROOT / "runtime" / ".cache" / "upstreams" / "indesign" / "archives" / "indesign-mcp-plugin.ccx"
DESTINATION = ROOT / "runtime" / "dist" / "indesign-mcp-plugin.ccx"
EXPECTED_HASH = LOCK["rinnellasky"]["artifacts"]["indesign-mcp-plugin.ccx"]["sha256"]


def patch_once(source: str, original: str, replacement: str, path: str) -> str:
    matches = source.count(original)
    if matches != 1:
        raise SystemExit(f"Expected one verified upstream patch location in {path}; found {matches}.")
    return source.replace(original, replacement)


def build() -> str:
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_HASH:
        raise SystemExit("The source UXP archive does not match the pinned upstream checksum.")

    with zipfile.ZipFile(SOURCE) as upstream:
        files: dict[str, bytes] = {}
        for member in upstream.infolist():
            path = PurePosixPath(member.filename)
            if path.is_absolute() or ".." in path.parts:
                raise SystemExit(f"Unsafe UXP package path: {member.filename}")
            if member.is_dir():
                continue
            files[member.filename] = upstream.read(member)

    manifest = json.loads(files["manifest.json"].decode("utf-8"))
    manifest["id"] = "org.adobe-ai-bridge.indesign"
    manifest["name"] = "Adobe AI Bridge for InDesign"
    manifest["entrypoints"][0]["label"]["default"] = "Adobe AI Bridge"
    manifest["requiredPermissions"]["network"]["domains"] = ["http://127.0.0.1:3001"]
    files["manifest.json"] = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

    html = files["index.html"].decode("utf-8")
    html = patch_once(
        html,
        '<div>Created by Mike Chambers</div>',
        '<label for="bridgeToken">Bridge connection token</label>\n'
        '      <input id="bridgeToken" type="password" autocomplete="off" '
        'placeholder="Paste the one-time bridge token" />\n'
        '      <p id="connectionStatus" role="status" aria-live="polite">Paste the token, then connect.</p>\n'
        '      <div>Based on adb-mcp by Mike Chambers</div>',
        "index.html",
    )
    files["index.html"] = html.encode("utf-8")

    script = files["main.js"].decode("utf-8")
    script = patch_once(
        script,
        'const PROXY_URL = "http://localhost:3001";',
        'const PROXY_URL = "http://127.0.0.1:3001";',
        "main.js",
    )
    script = patch_once(
        script,
        '        console.log("Received command packet:", packet);',
        '        // Keep document content out of the UXP developer console.',
        "main.js",
    )
    script = patch_once(
        script,
        '    socket = io(PROXY_URL, {\n'
        '        transports: ["websocket"],\n'
        '    });',
        '    const tokenInput = document.getElementById("bridgeToken");\n'
        '    const token = String(tokenInput.value || "").trim();\n'
        '    if (!token) {\n'
        '        document.getElementById("connectionStatus").textContent = "Paste the bridge token before connecting.";\n'
        '        return;\n'
        '    }\n'
        '    document.getElementById("connectionStatus").textContent = "Connecting to the local proxy…";\n'
        '    socket = io(PROXY_URL, {\n'
        '        transports: ["websocket"],\n'
        '        auth: { token },\n'
        '    });',
        "main.js",
    )
    script = patch_once(
        script,
        '    socket.on("registration_response", (data) => {\n'
        '        console.log("Received response:", data);\n'
        '        //TODO: connect button here\n'
        '    });',
        '    socket.on("registration_response", (data) => {\n'
        '        const status = document.getElementById("connectionStatus");\n'
        '        status.textContent = data.status === "success"\n'
        '            ? "Connected to the authenticated local proxy."\n'
        '            : "Another InDesign plugin session is already connected. Close it and retry.";\n'
        '        if (data.status !== "success") socket.disconnect();\n'
        '    });',
        "main.js",
    )
    script = patch_once(
        script,
        'document.getElementById("btnStart").addEventListener("click", () => {\n'
        '    if (socket && socket.connected) {\n'
        '        disconnectFromServer();\n'
        '    } else {\n'
        '        connectToServer();\n'
        '    }\n'
        '});',
        'document.getElementById("btnStart").addEventListener("click", () => {\n'
        '    if (socket && socket.connected) {\n'
        '        disconnectFromServer();\n'
        '        document.getElementById("connectionStatus").textContent = "Disconnected.";\n'
        '    } else {\n'
        '        connectToServer();\n'
        '    }\n'
        '});',
        "main.js",
    )
    script = re.sub(r"console\.log\(\"Connected to server with ID:\", socket\.id\);", "", script, count=1)
    script = re.sub(
        r'console\.error\("Connection error:", error\);',
        'console.error("Local bridge connection failed.");',
        script,
        count=1,
    )
    script = re.sub(
        r'console\.log\("Disconnected from server\. Reason:", reason\);',
        'console.log("Disconnected from local bridge.");',
        script,
        count=1,
    )
    if not re.search(r"auth:\s*\{\s*token\s*\}", script):
        raise SystemExit("The generated UXP plugin does not submit the authenticated bridge token.")
    if manifest["id"] != "org.adobe-ai-bridge.indesign":
        raise SystemExit("The generated UXP plugin identity is not owned by Adobe AI Bridge.")
    if manifest["requiredPermissions"]["network"]["domains"] != ["http://127.0.0.1:3001"]:
        raise SystemExit("The generated UXP plugin must be restricted to the loopback proxy.")
    if re.search(r"console\.log\([^;]*(packet|response|document)[^;]*\)", script, flags=re.IGNORECASE):
        raise SystemExit("The generated UXP plugin may log document or tool response content.")
    files["main.js"] = script.encode("utf-8")

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(DESTINATION, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for name in sorted(files):
            metadata = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            metadata.compress_type = zipfile.ZIP_DEFLATED
            metadata.external_attr = (0o100644 << 16)
            output.writestr(metadata, files[name])

    return hashlib.sha256(DESTINATION.read_bytes()).hexdigest()


if __name__ == "__main__":
    digest = build()
    expected_manager_hash = LOCK["rinnellasky"]["managerPackage"]["sha256"]
    if digest != expected_manager_hash:
        raise SystemExit(f"Managed UXP package checksum differs from the reviewed pin: {digest}")
    print(f"Built authenticated upstream UXP CCX: {DESTINATION} (sha256={digest})")
