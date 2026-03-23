"""Exercise the published MCP server through real stdio against a mock UXP panel."""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import pytest
import socketio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME = PROJECT_ROOT / "runtime"
UPSTREAM_ROOT = RUNTIME / ".cache" / "upstreams" / "indesign"
UPSTREAM_ENTRY = RUNTIME / "build" / "indesign" / "indesign-mcp" / "id-mcp.py"


def available_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def decode_result(result: Any) -> dict[str, Any]:
    structured_content = getattr(result, "structuredContent", None)
    if isinstance(structured_content, dict):
        return structured_content
    for item in result.content:
        if getattr(item, "type", None) == "text":
            value = json.loads(item.text)
            if isinstance(value, dict):
                return value
    raise AssertionError("The MCP response did not contain a JSON object.")


@pytest.mark.integration
def test_pinned_upstream_stdio_tools_read_only_calls_and_serializes() -> None:
    asyncio.run(exercise_mcp_stdio())


async def exercise_mcp_stdio() -> None:
    assert UPSTREAM_ENTRY.is_file(), f"Pinned upstream entrypoint missing: {UPSTREAM_ENTRY}"
    with tempfile.TemporaryDirectory(prefix="indesign-bridge-mcp-") as temporary:
        root = Path(temporary)
        os.chmod(root, 0o700)
        state_dir = root / "state"
        state_dir.mkdir(mode=0o700)
        token_path = root / "bridge.token"
        token = secrets.token_urlsafe(48)
        token_path.write_text(token, encoding="utf-8")
        os.chmod(token_path, 0o600)

        port = available_port()
        proxy_env = os.environ.copy()
        proxy_env.update(
            {
                "INDESIGN_BRIDGE_TOKEN_FILE": str(token_path),
                "INDESIGN_BRIDGE_STATE_DIR": str(state_dir),
                "INDESIGN_BRIDGE_PROXY_PORT": str(port),
                "INDESIGN_BRIDGE_PROXY_TIMEOUT_MS": "5000",
            }
        )
        proxy = subprocess.Popen(
            ["node", str(RUNTIME / "proxy" / "server.mjs")],
            cwd=RUNTIME,
            env=proxy_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        plugin: socketio.AsyncClient | None = None
        active = 0
        maximum_active = 0
        call_count = 0
        state_lock = asyncio.Lock()

        try:
            await wait_for_port(port, proxy)

            plugin = socketio.AsyncClient(reconnection=False)
            registered = asyncio.Event()

            @plugin.on("command_packet")
            async def receive_command(message: dict[str, Any]) -> None:
                nonlocal active, maximum_active, call_count
                async with state_lock:
                    active += 1
                    maximum_active = max(maximum_active, active)
                    call_count += 1
                try:
                    await asyncio.sleep(0.05)
                    await plugin.emit(
                        "command_packet_response",
                        {
                            "packet": {
                                "senderId": message["senderId"],
                                "requestId": message["requestId"],
                                "status": "SUCCESS",
                                "response": {
                                    "activeDocument": None,
                                    "pageCount": 3,
                                    "documentPath": "/mock/private/path.indd",
                                },
                            }
                        },
                    )
                finally:
                    async with state_lock:
                        active -= 1

            @plugin.on("connect")
            async def register_plugin() -> None:
                await plugin.emit("register", {"application": "indesign"})

            @plugin.on("registration_response")
            async def receive_registration(message: dict[str, Any]) -> None:
                if message.get("status") == "success":
                    registered.set()

            await plugin.connect(
                f"http://127.0.0.1:{port}",
                auth={"token": token},
                transports=["websocket"],
            )
            await asyncio.wait_for(registered.wait(), timeout=3)

            client_env = os.environ.copy()
            client_env.update(
                {
                    "INDESIGN_BRIDGE_TOKEN": token,
                    "INDESIGN_BRIDGE_PROXY_URL": f"http://127.0.0.1:{port}",
                    "INDESIGN_BRIDGE_PROXY_TIMEOUT": "5",
                }
            )
            parameters = StdioServerParameters(
                command="uv",
                args=["run", "--locked", "--project", str(RUNTIME), "mcp", "run", str(UPSTREAM_ENTRY)],
                cwd=str(RUNTIME),
                env=client_env,
            )
            async with stdio_client(parameters) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    initialized = await session.initialize()
                    assert initialized.serverInfo.name == "Adobe InDesign MCP Server"
                    tools = await session.list_tools()
                    names = {tool.name for tool in tools.tools}
                    assert len(names) >= 90
                    assert "get_active_document_settings" in names
                    assert "populate_template" in names

                    result = await session.call_tool("get_active_document_settings", {})
                    assert not result.isError
                    response = decode_result(result)
                    assert response["response"]["pageCount"] == 3

                    concurrent_results = await asyncio.gather(
                        *(
                            session.call_tool("get_active_document_settings", {})
                            for _ in range(4)
                        )
                    )
                    assert all(not call_result.isError for call_result in concurrent_results)

            assert call_count == 5
            assert maximum_active == 1, "The proxy executed two InDesign operations concurrently."
            assert not (state_dir / "indesign-operation-pending.json").exists()
        finally:
            if plugin is not None and plugin.connected:
                await plugin.disconnect()
            proxy.terminate()
            try:
                proxy.wait(timeout=4)
            except subprocess.TimeoutExpired:
                proxy.kill()
                proxy.wait(timeout=3)
            if proxy.returncode not in (0, -15):
                _, stderr = proxy.communicate()
                raise AssertionError(f"The proxy process failed: {stderr.decode(errors='replace')}")


async def wait_for_port(port: int, process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if process.poll() is not None:
            _, stderr = process.communicate()
            raise AssertionError(f"The proxy failed to start: {stderr.decode(errors='replace')}")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                return
        except OSError:
            await asyncio.sleep(0.05)
    raise AssertionError(f"The loopback proxy did not listen on port {port}.")
