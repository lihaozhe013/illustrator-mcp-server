# Upstream Audit

Audit date: 2026-10-08. Scope: the tracked Illustrator snapshot, the pinned InDesign MCP release, the UXP package, the proxy protocol, and the packaged dependency sets.

## Illustrator MCP snapshot

- Repository: `https://github.com/ie3jp/illustrator-mcp-server`
- Snapshot commit: `57c5c101a5192c61535493f39b653e6f92b8eb29`; package version `1.10.3`; MIT.
- The original upstream tree was moved into `illustrator-mcp/` without changing file bytes: 177 files compared against the pre-move SHA-256 manifest, zero mismatches.
- Build and test were run from `illustrator-mcp/`: `npm run build && npm test` passed 34 test files and 608 tests.
- A manager-owned, semver-compatible production lock is kept in `tauri-app/runtime/locks/illustrator/`; its production audit passed with zero advisories. The upstream package files and lock remain unchanged.
- The manager stages and builds a patched copy of this snapshot. Its packaging smoke test verifies initialize, exactly 67 tools including manager-owned `execute_jsx`, and clean JSON-RPC stdout. It does not invoke real Illustrator Automation.

## InDesign MCP and plugin

- Repository: `https://github.com/Rinellasky/indesign-mcp`; release `v1.2.1`; commit `7292d7bf9549d85acb530cb1de7fb24a0b6a551f`.
- `indesign-mcp/` is tracked in this repository as a snapshot of the upstream Git tree at the pinned commit. It currently contains four documentation/installer files and no executable Python/UXP implementation. The snapshot file hashes are recorded in `tauri-app/runtime/pins.lock.json`; builds verify them and do not clone, reset, or mutate the snapshot. `tauri-app/scripts/fetch_upstream.py` downloads and verifies the release archives before extracting a build-only copy.
- The snapshot is manually synchronized after review using `docs/indesign-upstream-sync.md`; the parent repository tracks ordinary files rather than a nested Git repository.
- Pinned DXT SHA-256: `e936c81d1c992a9d248b945a5fa4c4cdb8d6e7ab2f1be6cdf9b332e65fcc3257`. Pinned source CCX SHA-256: `20fc6c98a45968e9aa37745ec5d25eed93c5e30c15f31b917dc2586c551a74aa`. Generated manager UXP package version `1.2.1-bridge.2`, SHA-256 `55b3e1c6c802419444a17b3dfd71e85175d2b708204dd16b07943ce314a90bea`.
- Upstream repository license: MIT. The CCX contains Apache License 2.0. The generated runtime includes both notices, the Python PSF license, and a dependency notice inventory with available license texts.
- The DXT declares an MCP command that runs `mcp run <id-mcp.py>`; its Python source has no direct stdio `__main__` entry point. The bundled wrapper starts the upstream FastMCP instance and keeps diagnostics on stderr.
- Mock integration launches the patched upstream MCP and a Socket.IO mock UXP panel. It verifies exactly 100 tools, an open call, JSX parameters and timeout forwarding, parallel request serialization, and protocol stdout. The Rust launcher forwards upstream JSON-RPC lines without filtering tools.
- The original Mike Chambers proxy source was reviewed at `afe5d09cdbdd4cc60434dce6b3f46fdafe15a21c` (MIT, package `adb-proxy-socket` 0.85.1). The bundle uses a small manager-owned Socket.IO-compatible proxy rather than that server implementation because the upstream proxy broadcasts to all plugin sessions, logs payloads, and lacks authentication. Compatibility is covered by the mock protocol test.
- The bundled proxy binds only `127.0.0.1:3001`, authenticates UXP registration with a private token, accepts one plugin session, correlates sender/request IDs, serializes operations, removes content from logs, and reports timeouts or disconnects as potentially unknown without blocking later requests. A listening unrelated process is reported as a port conflict and is never terminated.
- The generated UXP manifest restricts network permission to `http://127.0.0.1:3001`. It still requests `localFileSystem: fullAccess` because upstream operations use file-backed document/image exchange. The bridge also exposes trusted JSX, which runs with the application's local access. Creative Cloud approval is manual.
- Python MCP production runtime builds as arm64 with PyInstaller `onedir`. The frozen binary packaging smoke test verifies exactly 100 tools and clean JSON-RPC stdout. Proxy and Illustrator runtime npm audits each reported zero production vulnerabilities; `pip-audit` reported no known Python dependency vulnerabilities.

## Verification and blockers

- `integration/mock`: InDesign stdio + UXP mock passed; Illustrator stdio + fake executor passed.
- `unit`: Rust core tests and Vitest tests passed; exact totals are recorded in the compatibility matrix. The moved Illustrator upstream suite passed 34 files / 608 tests.
- Real Illustrator E2E: `BLOCKED: not executed; the app is installed, but no Automation/document test was run.`
- Real InDesign/UXP E2E: `BLOCKED: the application is installed, but Creative Cloud package approval, panel launch, and a real document test have not been performed.`
- Real OpenCode and WorkBuddy MCP handshakes: `BLOCKED: no manager runtime was registered in the clients for an interactive handshake.` The user config files were not modified during verification.
- Formal distribution: `BLOCKED: no valid Developer ID signing identity is available.` An unsigned local arm64 DMG can be built for engineering inspection only.
