# Adobe AI Bridge Specification

Version: 1.1
Target: internal macOS Apple Silicon distribution
Status: implementation in milestones M0–M4

## Objective

Provide a lightweight installer and MCP bridge for Adobe Illustrator and Adobe InDesign. The Tauri app installs or replaces both complete runtimes and adds the selected OpenCode and Tencent WorkBuddy entries. After setup, clients launch the bridge directly; the desktop app is not required for MCP calls.

Agents receive every upstream MCP tool plus `execute_jsx`, including document open/save, edit, delete, export, template, and script operations. The bridge does not choose an editing workflow or create document copies. Agents choose whether to edit the current document, save a copy, or undo changes. JSX runs as trusted local code with the Adobe application's access; it is not sandboxed.

The Illustrator bridge reuses the tracked upstream snapshot in `illustrator-mcp/`. The InDesign bridge reuses the pinned upstream repository and DXT/CCX release source. Upstream snapshots remain unchanged; manager additions are applied to build copies.

## Layout and source ownership

- `illustrator-mcp/`: complete tracked Illustrator upstream snapshot, including tests, examples, release notes, license, and original `CLAUDE.md`.
- `indesign-mcp/`: tracked snapshot of the pinned InDesign Git tree. Its Python/UXP implementation is obtained from checksum-pinned release archives.
- `tauri-app/runtime/.cache/`: ignored upstream downloads and extracted sources.
- `tauri-app/runtime/build/`: ignored patched build copies and staging.
- `tauri-app/`: Tauri installer, Rust launcher, runtime wrappers, deterministic build patches, and tests.
- Root `docs/`: architecture, compatibility, risks, release, and manual verification records.

## Milestones and gates

### M0 — Source audit and bridge transport

1. Keep upstream snapshots byte-for-byte intact and verify source and release checksums.
2. Exercise MCP initialize, full `tools/list`, calls, errors, disconnects, timeout behavior, and clean stdio output using mocks.
3. Verify the InDesign loopback proxy authentication, request correlation, and serialized command queue.
4. Record real Adobe and client checks separately from mock results.

**Gate:** source integrity, full inventory, protocol cleanliness, and mock transport checks pass before packaging.

### M1 — Runtime installation and client connection

1. Bundle the two MCP runtimes, shared Node runtime, stable launcher, and InDesign proxy.
2. Install or replace the complete runtime bundles through one `Install / Update` action.
3. Atomically switch active runtime pointers, remove older app-owned runtime versions, and restart the InDesign proxy.
4. Add the selected client entries while preserving JSONC comments and unrelated settings. The manager remains closed during normal client use.

**Gate:** first install and same-version replacement pass against temporary install roots; user configs retain unrelated content.

### M2 — Complete MCP tool surface

1. Forward upstream JSON-RPC lines unchanged through the stable launcher. Do not filter `tools/list` or reject `tools/call` by tool name.
2. Expose the existing upstream tool inventory plus `execute_jsx`: 67 tools for Illustrator and 100 for InDesign.
3. For both engines, `execute_jsx(code, params?, timeout_ms?)` defaults to 60 seconds, accepts up to 300 seconds, and returns JSON-compatible values. Execution failures are MCP errors. A timeout or lost InDesign response must say that the result may be unknown; do not retry automatically.

**Gate:** packaged stdio smoke tests enumerate exactly 67 and 100 tools and exercise previously hidden edit/open calls and JSX transport.

### M3 — Coordinate clarity and real editing checks

1. Preserve Illustrator native `document` and `artboard` coordinate behavior. Add `artboard-web`, defined from each selected artboard's actual rectangle as `x = document_x - left` and `y = top - document_y`. `artboard_index` selects the rectangle for this conversion and defaults to the active artboard.
2. Return native artboard rectangles, ruler origins, units, and coordinate context with document/artboard metadata.
3. Exercise open, create, text edit, save, export, and a combined JSX edit against disposable test documents in both supported clients where available.

**Gate:** mock checks pass; real Illustrator, InDesign, OpenCode, and WorkBuddy evidence is labeled by exact versions. Missing user approval is recorded as blocked rather than inferred from mocks.

### M4 — Combined arm64 packaging

Produce one DMG with both runtimes and required notices. Verify first install, same-version reinstall, upgrade cleanup, client config preservation, and operation after closing Tauri. Creative Cloud may require a user to approve the InDesign UXP panel manually. Keep unsigned builds labeled as internal until signed and notarized.

## Runtime interfaces

- Stable launcher: `adobe-mcp-launcher --bridge illustrator|indesign`.
- Client server IDs: `illustrator-ai-bridge` and `indesign-ai-bridge`.
- MCP protocol stdout is reserved for JSON-RPC; diagnostics go to stderr and redacted logs.
- InDesign uses the existing authenticated loopback UXP proxy on `127.0.0.1:3001`.
- Runtime installs contain only the active app-owned version. Client settings, connection token, Adobe documents, and unrelated files are preserved.

## Verification labels

Report `unit`, `integration/mock`, `real-Illustrator E2E`, `real-InDesign E2E`, `OpenCode real-client`, and `WorkBuddy real-client` separately. Mocks do not establish Adobe or client connectivity. Before committing or packaging, run the applicable upstream, TypeScript, Rust, Python, mock, runtime-bundle, and DMG checks.
