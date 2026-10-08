# Compatibility Matrix

Updated: 2026-10-08. A successful build or mock test does not establish a real Adobe or client connection.

| Component | Observed version / platform | Automated status | Real integration status |
|---|---|---|---|
| macOS | 27.0.1, Apple Silicon arm64 | Full runtime bundle and local Tauri DMG build passed; DMG resource hashes and arm64 binaries verified | Developer machine only; clean-user install and upgrade lifecycle not exercised |
| Adobe Illustrator | 30.3.0 detected at `/Applications/Adobe Illustrator 2026/Adobe Illustrator.app` | Patched runtime build exposes all 67 tools through its packaged launcher; isolated MCP initialize, list, and open-call forwarding passed; upstream 34 files / 608 tests passed | `BLOCKED: real Automation permission, document editing, and coordinate placement were not exercised` |
| Adobe InDesign | 21.0.0.192 detected at `/Applications/Adobe InDesign 2026/Adobe InDesign 2026.app` | Frozen runtime build exposes all 100 tools through its packaged launcher; Python mock integration covers open, JSX success/failure, timeout transport, and protocol output | `BLOCKED: Creative Cloud approval, UXP panel handshake, and real document editing were not performed` |
| InDesign UXP | upstream v1.2.1 source, manager package `1.2.1-bridge.2` | CCX built and SHA-256 pinned; loopback, authentication, request correlation, and JSX packaging checks passed | `BLOCKED: package not installed or approved in Creative Cloud` |
| OpenCode | `opencode v2.0.24`; user JSONC exists | Config merge tests verify JSONC comments and unrelated settings remain intact | `BLOCKED: real launcher registration and MCP handshake were not performed` |
| Tencent WorkBuddy | installed app process reports v5.7.6; user MCP JSON exists | Config merge tests verify JSONC comments and unrelated settings remain intact | `BLOCKED: real launcher registration and MCP handshake were not performed` |
| Production dependencies | Node production locks for both runtimes | `npm audit --omit=dev`: zero reported vulnerabilities for each bundled Node dependency tree | Audit results do not establish runtime behavior |
| Developer ID signing | no valid identity found by `security find-identity` | Local unsigned DMG built and verified | `BLOCKED: signing and notarization require a valid Developer ID identity` |

Automated status on 2026-10-08: `pnpm verify` passed with 9 Vitest tests, 4 Python tests, and 20 Rust tests (18 core and 2 launcher). Rust tests cover initial install, same-version full replacement, and upgrade cleanup against a temporary install root. The Illustrator upstream suite passed all 608 tests across 34 files. The built launcher smoke listed exactly 67 Illustrator and 100 InDesign tools and forwarded `open_document` calls. The final local DMG passed resource, license, launcher, and arm64 checks. No runtime was installed into the user's home directory and no client configuration was changed during these checks.
