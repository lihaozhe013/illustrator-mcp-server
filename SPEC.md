# Adobe AI Bridge Specification

Version: 1.0
Target: internal macOS Apple Silicon distribution
Status: implementation in milestones M0–M4

## Objective

Deliver one installer/manager application that independently connects Adobe Illustrator and Adobe InDesign to OpenCode and Tencent WorkBuddy. The DMG contains both client-agnostic bridge runtimes; users select which bridges to install. It must work after the GUI closes and must protect customer documents and client configuration.

The Illustrator bridge reuses the tracked upstream snapshot in `illustrator-mcp/`. The InDesign bridge reuses the pinned upstream repository and its DXT/CCX release source. Use small, auditable wrappers rather than reimplementing Adobe APIs.

## Layout and source ownership

- `illustrator-mcp/`: complete tracked Illustrator upstream snapshot, including its existing tests, release notes, license, and original `CLAUDE.md`. Run those project commands from this directory.
- `indesign-mcp/`: tracked snapshot of the pinned InDesign upstream Git tree. It is manually synchronized and hash-verified; build scripts never clone, reset, or modify this directory.
- `tauri-app/runtime/.cache/`: ignored downloaded releases, extracted upstream sources, and build staging.
- `tauri-app/runtime/patches/`: committed, narrowly scoped patches against pinned source.
- `tauri-app/`: independent Tauri 2 manager, Rust launcher/core, React/TypeScript UI, packaging, and tests.
- Root `docs/`: combined audit, architecture, compatibility, risk, release, and manual E2E records.

This repository intentionally has no CI or GitHub automation. Run verification commands locally before committing or packaging. Upstream snapshots remain source references; upstream automation configuration is not part of this project.

## Milestones and gates

### M0 — Restructure, audit, and bridge spikes

1. Move the complete tracked Illustrator upstream source tree into `illustrator-mcp/` without changing source contents. Record a file/hash manifest before the move and compare after. Do not retain upstream CI or release automation. Run its build and unit suite from the new working directory.
2. Pin the InDesign Git commit and tracked snapshot file hashes, release DXT/CCX checksums, proxy commit, runtime versions, and licenses in a manager-owned lock manifest. Synchronize the Git snapshot manually after review. The build verifies the tracked snapshot, downloads checksum-matched DXT/CCX artifacts, extracts release-only implementation into an ignored cache, verifies third-party notices, and applies patches only in build staging.
3. Independently run both native upstream stdio servers in test harnesses. Verify initialize, tools/list, a benign read, error/close behavior, and clean protocol stdout.
4. Test an Illustrator executor mock and a mock InDesign UXP Socket.IO plugin. Validate the authenticated plugin registration, request correlation, timeout/disconnect behavior, concurrent clients, and redacted logs.
5. Attempt read-only and working-copy real-app checks where possible. Record evidence by exact application version. A real Adobe or client test that needs user approval remains `BLOCKED`; it does not block progressing through engineering milestones.

**Gate:** migration hashes, upstream licensing/source integrity, both stdio spikes, and both mock transports pass. Do not package a component with unresolved licensing or security blockers.

### M1 — Shared manager and independent bridge lifecycle

Build a Tauri 2 app (React, strict TypeScript, Rust) and a stable Rust launcher. Put installed files in `~/Library/Application Support/AdobeAIBridge/`, version bridge runtimes independently, and use per-user LaunchAgents so both engines outlive the GUI. Keep an engine failure or rollback isolated from the other engine.

The Illustrator engine runs its pinned Node MCP over AppleScript/ExtendScript. The InDesign engine runs its self-contained Python MCP and a shared authenticated Socket.IO proxy. Bundle a pinned Node runtime and build Python with PyInstaller `onedir`; the end user must not need Node, Python, uv, Homebrew, or a development PATH.

Expose per-engine diagnostics for app installation/version, Automation permission or UXP plugin, daemon health, MCP handshake, and benign document metadata. Show last verification time and recovery guidance. Use a private Unix socket for manager IPC; the InDesign proxy binds only `127.0.0.1:3001` and never kills a process on a port conflict.

### M2 — Four reversible client connections

Register separate server IDs `illustrator-ai-bridge` and `indesign-ai-bridge` in each supported client. Provide independent toggles for the four client/engine pairs. Detect OpenCode stable and V2 schemas from the installed config/version; use WorkBuddy's installed user-level `mcp.json` schema only after validation.

Preview both changes before applying. Preserve JSONC comments, permissions, unrelated keys, and project-level precedence. Make a backup and atomic per-file write; rollback on failure. Uninstall removes only unchanged app-owned entries. Report client registration separately from a real client initialize/tools/list/read check.

### M3 — Reviewed tools and safe document operations

Expose upstream read/create/edit/export tools only through a per-engine audited allowlist. Preserve upstream tool names, validate schemas, and keep arbitrary script/eval tools disabled. Publish these common high-level tools on each server: `bridge_diagnostics`, `inspect_template`, `replace_template_content`, and `validate_document`.

Before each request verify the managed document identity and engine session. Serialize complete write transactions across clients within that engine; Illustrator and InDesign may operate independently. Never silently take ownership of an existing unsaved user document.

Template replacements use the sequence **preflight → same-volume work copy → replace → exact-text and document validation → save/reopen and recheck → commit output**. Do not overwrite an existing output. Defaults: `dryRun` performs no document writes, style preservation is enabled, automatic reflow is disabled, and detectable overset prevents output commit. Reject duplicate/ambiguous fields, locked targets, and unsupported mixed/threaded styles. Return a clear capability error when overflow cannot be reliably checked.

Account for existing upstream behavior: Illustrator `ensureUUID()` may write object notes; such inspection runs only on a managed copy. Audit InDesign field naming and story/thread overflow separately before advertising support.

After an uncertain timeout or plugin disconnect, persist an outcome-unknown marker and reject later writes for that engine until explicit state inspection/recovery. Never automatically replay a write or clear the marker just by restarting.

### M4 — Combined arm64 packaging

Produce one DMG with both runtimes, app-owned licenses/notices, stable launcher, and independently versioned engine resources. Test installing just one bridge, installing both, moving the app, closing the GUI, clean PATH behavior, per-engine upgrades/rollbacks, and uninstalling one without damaging the other.

Provide designer setup and recovery instructions, manual real-app E2E checklist, release notes, and `KNOWN_LIMITATIONS.md`. Until signed/notarized with valid credentials and verified on two clean Apple Silicon users, label the DMG internal test build.

## Public runtime interfaces

- Launcher: stable `adobe-mcp-launcher --bridge illustrator` and `adobe-mcp-launcher --bridge indesign`; MCP stdio remains on stdout, diagnostics go to stderr/logs.
- Client IDs: `illustrator-ai-bridge` and `indesign-ai-bridge`, independently configured for OpenCode and WorkBuddy.
- Manager commands use a typed `bridgeId` (`illustrator` or `indesign`) and return `ok`, stable error `code`, `message`, `recovery`, `lastVerifiedLayer`, and timestamp. UI must not invoke arbitrary shell commands.
- High-level document results report source/output fingerprints, per-field status, warnings/preflight, PDF outputs, and rollback/unknown-outcome status. Document text is omitted from diagnostic exports by default.

## Verification labels and minimum checks

Every result is labeled `unit`, `integration/mock`, `real-Illustrator E2E`, `real-InDesign E2E`, `OpenCode real-client`, or `WorkBuddy real-client`. Never infer real connectivity from process health or mocks.

Automate applicable checks for upstream regression after relocation, stdio purity and lifecycle, mock bridge transport, four client configuration pairs and rollback, concurrent sessions, source immutability, CJK/empty text, duplicate fields, lock/format/overset/link/font failures, install/upgrade/uninstall, and DMG architecture/license integrity. Keep Vitest at 5.0.3 for the manager; preserve each upstream's own dependency lock.
