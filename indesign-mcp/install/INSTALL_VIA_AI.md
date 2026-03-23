# Installing the InDesign MCP — instructions for AI agents

These steps let an AI agent with shell access (Claude Desktop/Cowork/Code,
or any MCP client) install the InDesign MCP *for* the user. Follow them in
order, ask before overwriting anything, and report each step's outcome.

If you are a human: run the one-liner in the README instead — it does all
of this automatically.

## Prerequisites to verify first

1. `uv --version` succeeds (if not: `winget install astral-sh.uv` on Windows,
   `brew install uv` on macOS — then use a fresh shell).
2. Claude Desktop (or another MCP client) is installed.
3. Adobe InDesign 20.2+ is installed.

## Steps (Windows paths; adapt for macOS)

1. **Get the release artifacts.** From the latest release at
   `https://github.com/Rinellasky/indesign-mcp/releases/latest`, download:
   - `indesign-mcp.dxt` (the MCP server bundle — it is a zip archive)
   - `adb-proxy-socket-win-x64.exe` (macOS: `adb-proxy-socket-macos-arm64`
     or `-x64`)

2. **Extract the server.** Unzip `indesign-mcp.dxt` into
   `%LOCALAPPDATA%\indesign-mcp\server` (rename to `.zip` first if your
   unzip tool requires it). Put the proxy executable in
   `%LOCALAPPDATA%\indesign-mcp\`.

3. **Register the MCP server.** In the user's MCP client config — for
   Claude Desktop `%APPDATA%\Claude\claude_desktop_config.json` — BACK THE
   FILE UP, then add under `mcpServers` (do not touch other entries):

   ```json
   "indesign-mcp": {
     "command": "uv",
     "args": ["run",
              "--with", "fonttools", "--with", "mcp", "--with", "mcp[cli]",
              "--with", "python-socketio", "--with", "requests",
              "--with", "numpy", "--with", "pillow", "--with", "websocket-client",
              "mcp", "run",
              "C:\\Users\\<user>\\AppData\\Local\\indesign-mcp\\server\\id-mcp.py"]
   }
   ```

   IMPORTANT: `id-mcp.py` has no `__main__` block — it MUST be launched via
   `mcp run` exactly as above; `python id-mcp.py` exits silently.

4. **Install the UXP plugin.** Download `indesign-mcp-plugin.ccx` from the
   latest release and open it — Adobe Creative Cloud installs it into
   InDesign.

5. **Start the proxy.** Launch the proxy executable. It listens on
   `localhost:3001` and must stay running. Verify with a TCP check on
   port 3001.

6. **Connect the plugin.** Have the user open InDesign → Plugins →
   *InDesign MCP Agent* panel → click **Connect** (they can enable
   "Connect on Launch"). This step needs a human — the panel is inside
   InDesign.

7. **Restart the MCP client** (Claude Desktop) so it picks up the new
   server, then health-check by calling the `get_active_document_settings`
   tool — it returns document settings (or null with no document open) and
   proves the whole chain works.

## Troubleshooting for agents

- Tool calls time out → the plugin isn't connected (step 6) or the proxy
  isn't running (step 5). A timeout on long exports (PDF/EPUB/package) is
  NOT a failure — check the output file.
- `TypeError ... undefined` on basic calls → a stale plugin build is
  loaded; reinstall the `.ccx`.
- Every command errors with "Requires an open InDesign document" → open or
  create a document first (`create_document`).
- The panel's Connect button does nothing → check that no OS dialog is
  blocking InDesign and that the proxy is reachable on port 3001.
- Everything suddenly times out mid-session → a blocking OS dialog (e.g. a
  "pick an app to open this file" dialog after an export) wedges InDesign's
  scripting engine; dismissing it recovers instantly.
