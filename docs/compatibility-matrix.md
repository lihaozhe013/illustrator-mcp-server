# Compatibility Matrix

Updated: 2026-10-08. Presence/version detection is separate from a verified MCP connection.

| Component | Observed version / platform | Automated status | Real integration status |
|---|---|---|---|
| macOS | 27.0.1, Apple Silicon arm64 | arm64 runtime and Tauri DMG build passed | Developer machine only; clean-user installation not tested |
| Adobe Illustrator | 30.3.0 detected at `/Applications/Adobe Illustrator 2026/Adobe Illustrator.app` | multi-source discovery shown in the running Tauri manager; 2020–2026 and future-version fixtures pass; upstream 34 files / 608 tests and fake-executor stdio smoke pass | `BLOCKED: no real Automation permission or document E2E was exercised` |
| Adobe InDesign | 21.0.0.192 detected at `/Applications/Adobe InDesign 2026/Adobe InDesign 2026.app` | multi-source discovery shown in the running Tauri manager; 2020–2026 and future-version fixtures pass; patched upstream stdio + mock UXP integration pass | `BLOCKED: Creative Cloud approval, UXP panel handshake, and document E2E have not been performed` |
| InDesign UXP | upstream v1.2.1 source, manager package `1.2.1-bridge.1` | CCX package built and SHA-256 pinned; loopback/auth restrictions checked | `BLOCKED: package not installed or approved in Creative Cloud` |
| OpenCode | `opencode v2.0.24`; user JSONC exists | stable/V2 config preview and removal tests pass | `BLOCKED: actual manager server was not registered or handshaken` |
| Tencent WorkBuddy | installed app process reports v5.7.6; user MCP JSON exists | WorkBuddy schema preview and removal test pass | `BLOCKED: actual manager server was not registered or handshaken` |
| Runtime dependency audits | Node production locks for both runtimes | `npm audit --omit=dev`: 0 vulnerabilities for each bundled Node dependency tree | Not a substitute for runtime behavioral testing |
| Developer ID signing | no valid identity found by `security find-identity` | unsigned DMG build passed | `BLOCKED: formal signing and notarization require a valid Developer ID identity` |

Automated manager status on 2026-10-08: `pnpm verify` passed with Vitest 10 tests, Python snapshot and mock integration tests 4, Rust tests 17 core + 3 launcher, and moved Illustrator upstream 34 files / 608 tests. The frozen InDesign PyInstaller runtime also passed initialize and tools/list smoke checks with protocol-clean stdout. The final local DMG passed resource, license, and arm64 checks. The unsigned DMG is an engineering artifact, not a supported clean-user installation.
