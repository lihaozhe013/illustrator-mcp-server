# Risk Register

Updated: 2026-10-08.

| Risk | Effect | Mitigation / status |
|---|---|---|
| The tracked InDesign Git snapshot contains documentation/installers but not the Python/UXP implementation | Build provenance depends on release artifacts as well as the tracked snapshot | Manually synchronize the reviewed Git snapshot, verify its per-file hashes, pin both release archive hashes, retain source extraction and narrowly scoped deterministic patches, and verify the derived UXP checksum |
| UXP requests `localFileSystem: fullAccess` | The extension can access local files through its upstream command surface | Creative Cloud must ask the user to approve; network permission is restricted to loopback; default MCP launcher filters to reviewed read tools. Keep template writes disabled until path and transaction validation is implemented |
| Local port 3001 may already be occupied | The proxy cannot start or may be confused with another local service | Bind loopback, report an explicit conflict, and never terminate the existing process |
| UXP disconnect or timeout during a write can leave an unknown document state | Retrying could duplicate an operation | Proxy serializes requests and persists an unknown-outcome marker; real plugin behavior and recovery UI are not yet verified |
| OpenCode/WorkBuddy versions may interpret schemas differently | A valid JSON entry may not start the server | Config previews are tested locally; actual client launch/initialize remains blocked pending real-client validation |
| Configuration comments and external edits can be lost | User settings may be damaged | JSONC-aware frontend edits, Rust semantic guard, expected-file hash, private backup, atomic replacement, and exact-entry-only removal |
| Runtime source and final app may differ by build environment | Reproduction and supply-chain risk | Pin upstream commits, archives, Node version, npm lockfiles and Python `uv.lock`; hash generated bundles; verify arm64 outputs |
| PyInstaller and npm runtime bundles can contain extra libraries | App size and license obligations increase | Inventory included dependency metadata and license texts, audit production npm dependencies, and inspect the final resource manifest before release |
| No Developer ID signing identity is available | macOS trust prompts prevent clean-user deployment | Current DMG is unsigned and only for internal engineering inspection; signing/notarization remain blocked |
| M1 recovery and M3 safe template pipeline are incomplete | End-user workflow is not yet production-complete | Keep the tool allowlist read-only, document the gap, and do not claim the Definition of Done |
