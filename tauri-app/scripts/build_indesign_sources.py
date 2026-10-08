#!/usr/bin/env python3
"""Prepare a patched build copy of the pinned InDesign MCP sources."""

from __future__ import annotations

import ast
import re
import shutil
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
SOURCE = APP_ROOT / "runtime" / ".cache" / "upstreams" / "indesign" / "indesign-mcp"
BUILD_ROOT = APP_ROOT / "runtime" / "build" / "indesign"
PATCHED_SOURCE = BUILD_ROOT / "indesign-mcp"


def replace_once(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise SystemExit(f"Expected one pinned patch anchor in {label}; found {count}.")
    return text.replace(before, after, 1)


def patch_sources() -> Path:
    if not SOURCE.is_dir():
        raise SystemExit("Pinned InDesign release sources are missing; run scripts/fetch_upstream.py first.")

    resolved_build = BUILD_ROOT.resolve()
    if APP_ROOT.resolve() not in resolved_build.parents:
        raise SystemExit("Refusing to write InDesign build output outside the manager runtime directory.")
    if BUILD_ROOT.exists():
        shutil.rmtree(BUILD_ROOT)
    PATCHED_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(SOURCE, PATCHED_SOURCE)

    id_mcp_path = PATCHED_SOURCE / "id-mcp.py"
    id_mcp = id_mcp_path.read_text(encoding="utf-8")
    if not re.search(r"(?m)^import os$", id_mcp):
        id_mcp = replace_once(id_mcp, "import io\n", "import io\nimport os\n", "id-mcp.py imports")
    id_mcp = replace_once(
        id_mcp,
        "PROXY_URL = 'http://localhost:3001'",
        'PROXY_URL = os.environ.get("INDESIGN_BRIDGE_PROXY_URL", "http://127.0.0.1:3001")',
        "id-mcp.py proxy address",
    )
    id_mcp = replace_once(
        id_mcp,
        'ID_SEQUENCES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),\n'
        '                                 "id_action_sequences.json")',
        'BRIDGE_STATE_DIR = os.environ.get("INDESIGN_BRIDGE_STATE_DIR") or os.path.join(\n'
        '    os.path.expanduser("~"), "Library", "Application Support", "AdobeAIBridge", "state"\n'
        ')\n'
        'os.makedirs(BRIDGE_STATE_DIR, mode=0o700, exist_ok=True)\n'
        'ID_SEQUENCES_FILE = os.path.join(BRIDGE_STATE_DIR, "id_action_sequences.json")',
        "id-mcp.py persistent sequence path",
    )
    id_mcp_path.write_text(id_mcp, encoding="utf-8")
    importable_mcp_path = PATCHED_SOURCE / "id_mcp.py"
    shutil.copy2(id_mcp_path, importable_mcp_path)

    core_path = PATCHED_SOURCE / "core.py"
    core = core_path.read_text(encoding="utf-8")
    core = replace_once(
        core,
        "def sendCommand(command:dict):\n\n    response = socket_client.send_message_blocking(command)",
        "def sendCommand(command:dict, timeout_ms=None):\n\n    timeout = timeout_ms / 1000 if timeout_ms is not None else None\n    response = socket_client.send_message_blocking(command, timeout=timeout)",
        "core.py per-request timeout",
    )
    core_path.write_text(core, encoding="utf-8")

    script_tool = '''@mcp.tool()
def execute_jsx(code: str, params: dict | None = None, timeout_ms: int = 60000):
    """Execute trusted ExtendScript JSX in the active InDesign application."""
    if not code.strip():
        raise ValueError("JSX source must not be empty")
    if timeout_ms < 1000 or timeout_ms > 300000:
        raise ValueError("timeout_ms must be between 1000 and 300000")
    command = createCommand("executeJsx", {
        "code": code,
        "params": params or {},
        "timeoutMs": timeout_ms
    })
    return sendCommand(command, timeout_ms=timeout_ms + 10000)


'''
    id_mcp = id_mcp_path.read_text(encoding="utf-8")
    id_mcp = replace_once(
        id_mcp,
        "# Instructions resource\n",
        script_tool + "# Instructions resource\n",
        "id-mcp.py JSX tool registration",
    )
    id_mcp_path.write_text(id_mcp, encoding="utf-8")
    shutil.copy2(id_mcp_path, importable_mcp_path)

    socket_path = PATCHED_SOURCE / "socket_client.py"
    socket_client = socket_path.read_text(encoding="utf-8")
    socket_client = replace_once(
        socket_client,
        "import socketio\n",
        "import socketio\nimport os\n",
        "socket_client.py imports",
    )
    socket_client = replace_once(
        socket_client,
        "proxy_timeout = None\napplication = None\n",
        "proxy_timeout = None\napplication = None\nbridge_token = None\n",
        "socket_client.py token state",
    )
    socket_client = replace_once(
        socket_client,
        '    # Check if configuration is set\n    if not application or not proxy_url or not proxy_timeout:\n',
        '    # Reject missing bridge credentials before opening a local connection.\n'
        '    if not bridge_token or len(bridge_token) < 32:\n'
        '        raise RuntimeError("The bridge session token is missing or invalid.")\n'
        '    # Check if configuration is set\n    if not application or not proxy_url or not proxy_timeout:\n',
        "socket_client.py token validation",
    )
    socket_client = replace_once(
        socket_client,
        'logger.log(f"Sending message to {application}: {command}")',
        'logger.log(f"Sending {application} action: {command.get(\'action\', \'unknown\') if isinstance(command, dict) else \'unknown\'}")',
        "socket_client.py command log redaction",
    )
    socket_client = replace_once(
        socket_client,
        'logger.log(f"Received response: {data}")',
        'logger.log("Received InDesign proxy response.")',
        "socket_client.py packet log redaction",
    )
    socket_client = replace_once(
        socket_client,
        "sio.connect(proxy_url, transports=['websocket'])",
        "sio.connect(proxy_url, transports=['websocket'], auth={'token': bridge_token})",
        "socket_client.py authenticated handshake",
    )
    socket_client = replace_once(socket_client, 'logger.log(json.dumps(response))', 'logger.log("InDesign proxy response processed.")', "socket_client.py response log")
    socket_client = replace_once(
        socket_client,
        'logger.log(f"Response (not JSON-serializable): {response}")',
        'logger.log("InDesign proxy returned a non-JSON response.")',
        "socket_client.py fallback response log",
    )
    socket_client = replace_once(
        socket_client,
        "def configure(app=None, url=None, timeout=None):",
        "def configure(app=None, url=None, timeout=None, token=None):",
        "socket_client.py configure signature",
    )
    socket_client = replace_once(
        socket_client,
        "def configure(app=None, url=None, timeout=None, token=None):\n    \n    global application, proxy_url, proxy_timeout\n",
        "def configure(app=None, url=None, timeout=None, token=None):\n    \n    global application, proxy_url, proxy_timeout, bridge_token\n",
        "socket_client.py configure token",
    )
    socket_client = replace_once(
        socket_client,
        "    global application, proxy_url, proxy_timeout, bridge_token\n    \n    if app:\n",
        "    global application, proxy_url, proxy_timeout, bridge_token\n"
        "    bridge_token = token or os.environ.get('INDESIGN_BRIDGE_TOKEN')\n    \n    if app:\n",
        "socket_client.py configure token input",
    )
    socket_path.write_text(socket_client, encoding="utf-8")

    fonts_path = PATCHED_SOURCE / "fonts.py"
    fonts = fonts_path.read_text(encoding="utf-8")
    fonts = re.sub(r"(?m)^(\s*)print\(([^\n]*)\)$", r"\1print(\2, file=sys.stderr)", fonts)
    if "print(" in fonts:
        for line_number, line in enumerate(fonts.splitlines(), start=1):
            if "print(" in line and "file=sys.stderr" not in line:
                raise SystemExit(f"Unredirected Python font log at line {line_number}.")
    fonts_path.write_text(fonts, encoding="utf-8")

    for path in (id_mcp_path, importable_mcp_path, core_path, socket_path, fonts_path):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    return PATCHED_SOURCE


if __name__ == "__main__":
    prepared = patch_sources()
    print(f"Prepared patched InDesign source copy: {prepared}")
