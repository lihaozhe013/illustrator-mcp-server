# Adobe AI Bridge Architecture

Updated: 2026-10-08. This document describes the implementation present in this repository and separates verified behavior from real-application gaps.

## Repository boundaries

- `illustrator-mcp/` is the byte-preserved, Git-tracked Illustrator MCP upstream snapshot. Manager-only runtime locks and packaging logic live under `tauri-app/runtime/` and `tauri-app/scripts/`.
- `indesign-mcp/` is a tracked snapshot of the pinned upstream Git tree. It is manually synchronized after review, with per-file hashes in the lock manifest. Release archives containing the executable Python/UXP implementation are checksum-verified and staged into ignored runtime build directories before manager patches are applied.
- `tauri-app/` contains the Tauri 2 desktop app, React/TypeScript UI, Rust manager and launcher, client configuration adapters, runtime packages, and tests.
- `docs/` contains shared audits, compatibility results, release notes, risks, and known limitations.

The InDesign Git snapshot is manually synchronized by maintainers. Build scripts verify its exact file inventory and SHA-256 values and do not perform upstream Git operations. Runtime implementation remains sourced from separately pinned release archives because the upstream Git tree does not include it. See `indesign-upstream-sync.md` for the sync procedure.

The two upstreams retain their own source, license, lock files, and development conventions. A single manager UI selects an engine by `bridgeId`; installation, runtime versions, backups, and uninstall are tracked independently.

## Runtime paths

Illustrator calls follow:

```text
OpenCode or WorkBuddy stdio
  -> stable Rust launcher (--bridge illustrator)
  -> manager-owned Node runtime and audited upstream Illustrator MCP
  -> osascript / ExtendScript
  -> Adobe Illustrator
```

InDesign calls follow:

```text
OpenCode or WorkBuddy stdio
  -> stable Rust launcher (--bridge indesign)
  -> frozen PyInstaller upstream MCP
  -> Socket.IO over 127.0.0.1:3001
  -> manager-owned Node proxy
  -> approved UXP panel
  -> Adobe InDesign
```

The InDesign proxy is a per-user LaunchAgent so the UXP panel transport can remain available after the GUI closes. MCP stdio servers are started by the client through the stable launcher. The GUI does not proxy MCP protocol traffic.

Runtime artifacts are built from checksum-pinned inputs and embedded in the DMG. Installation stores engine versions below `~/Library/Application Support/AdobeAIBridge`, atomically switches the active version, and retains a prior version for rollback. The shared launcher and Node runtime are removed only when neither engine still needs them. The installer validates the embedded resource manifest and rejects unsafe symlink traversal. The manager owns runtime lifecycle commands, but complete upgrade/rollback/uninstall lifecycle testing still needs to be performed on a clean user account.

## InDesign transport and security

The proxy binds explicitly to loopback, rejects unauthenticated UXP sessions using a private token file, accepts one active plugin session, matches sender and request identifiers, serializes command handling, and avoids logging document payloads. Port conflicts are reported without killing the process that already owns the port. Unknown write outcomes are persisted so the application can avoid silently replaying a potentially completed operation.

The packaged UXP manifest limits network access to the loopback proxy. The upstream plugin also requests `localFileSystem: fullAccess` for file-backed exchange; Creative Cloud approval is required. The plugin has not yet been installed or approved in Creative Cloud on the development machine.

The stable launcher filters upstream tools to an audited read-only allowlist. Arbitrary scripts, upstream write operations, and exports are not exposed by default. Diagnostic responses redact secrets and omit document text. A private Unix-socket manager control plane has not been implemented; the GUI currently invokes typed Tauri commands directly.

## Client configuration

The UI represents four independent registrations: OpenCode/Illustrator, OpenCode/InDesign, WorkBuddy/Illustrator, and WorkBuddy/InDesign. Each entry has a distinct server name and points to the stable launcher with an explicit engine argument.

Rust client adapters recognize OpenCode stable and V2 configuration shapes and WorkBuddy's `mcpServers` shape. They prepare a preview, compare the expected file hash, keep a private backup, write atomically, and remove only the exact unchanged entry owned by this app. Tests cover comments and unrelated values through JSONC-aware parsing and client-specific state. Actual MCP handshakes from the installed clients have not been run, and the user config files were left untouched during implementation.

## GUI and typed command boundary

The Tauri UI provides per-engine detection and runtime actions, InDesign proxy controls and UXP onboarding, diagnostic status, and client configuration preview/apply/removal. Rust returns typed action results with status, error code, recovery guidance, last verification layer, and timestamp. The UI does not launch arbitrary shell commands or directly edit system files.

Current diagnostics separate application detection, runtime installation, proxy health, plugin connection, MCP stdio, and document-level verification. Detection is not reported as a successful application connection. Real Adobe and client verification remain blocked as listed in `compatibility-matrix.md`.

## Template-operation boundary

Safe document operations are not implemented yet. The high-level `bridge_diagnostics`, `inspect_template`, `replace_template_content`, and `validate_document` tools are not published. The current default tool surface is read-only, with arbitrary script execution disabled. Before enabling writes, each engine needs a document identity contract and a tested adapter that performs preflight, makes a working copy, validates exact changes and document health, saves and rechecks, and commits output only after all checks pass. InDesign formatting behavior and Illustrator overflow detection also require real-application fixtures; mocks alone cannot establish those behaviors.

## Verification layers

- `unit`: Vitest 5.0.3 client/UI tests, Python upstream-snapshot verification tests, and Rust core/launcher tests.
- `integration/mock`: one Python test exercises the patched InDesign MCP plus mock UXP; Illustrator MCP also runs with a fake executor. Protocol purity, read-only calls, serialization, and failure behavior are covered.
- `real-application`: Illustrator Automation/document operations and InDesign/UXP operations; both are blocked until permissions and application interaction are completed.
- `real-client`: four actual OpenCode/WorkBuddy registrations and handshakes; blocked until the manager is registered and tested in each installed client.
- `distribution`: arm64 unsigned DMG, runtime hashes, license presence, and embedded Mach-O architecture verified. Developer ID signing, notarization, clean-user installation, and two-user release acceptance remain blocked.
