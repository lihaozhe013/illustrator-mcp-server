# Release and Local Build

The supported target is macOS Apple Silicon (`aarch64-apple-darwin`). Build from `tauri-app/` with `pnpm install --frozen-lockfile`, `pnpm verify`, then `pnpm build:dmg`. The runtime builder downloads only checksum-pinned Node and upstream release inputs, stages and patches InDesign code, builds arm64 Python/Node resources, creates hash manifests, and asks Tauri to embed both engines in one DMG.

On 2026-10-08 `pnpm verify` passed: 9 Vitest tests, 4 Python tests, 20 Rust tests, and the separate Illustrator upstream suite of 608 tests across 34 files. Rust tests cover initial install, same-version full replacement, and upgrade cleanup against a temporary install root. Runtime packaging smoke tests exposed all 67 Illustrator and 100 InDesign tools through the bundled launchers, forwarded `open_document`, and kept stdout protocol-clean. `pnpm build:dmg` completed, and `pnpm verify:dmg` validated 3,833 Illustrator resources, 2,787 InDesign resources, two shared Node runtime resources, license files, launcher, and arm64 binaries. The generated DMG is 93.01 MiB (97,525,516 bytes), unsigned, with SHA-256 `8c9ed1caaaec01cc962371016aacbeeef46039e0aa5c6e7d02cec5142130509c`. This remains an engineering artifact; signing, notarization, real client handshakes, and real Adobe editing checks are still outstanding.

Before a signed internal release:

1. Run `pnpm install --frozen-lockfile` and `pnpm verify` from `tauri-app/`, plus the Illustrator upstream build/test from `illustrator-mcp/`.
2. Rebuild the pinned runtimes, confirm their manifests and license notices, inspect Mach-O architecture, and run `pnpm verify:dmg` (also included in `pnpm build:dmg`).
3. Complete real InDesign/UXP and Illustrator working-copy tests, then verify the four OpenCode/WorkBuddy × engine connections.
4. Exercise first install, same-version replacement, and upgrade. Confirm old app-owned runtime directories are removed, client settings are preserved, the InDesign proxy restarts, and both clients continue working after the GUI closes. This installer has no rollback or runtime-management screen.
5. Sign nested executables before the app with the actual Developer ID; notarize and verify the ticket. No signing identity is currently available.
6. Run the manual checklist on two clean Apple Silicon user accounts; record app, client, Adobe, and runtime versions, without retaining customer content or credentials.

Never check in generated bundles, signing secrets, or customer configuration. The tracked InDesign Git snapshot is updated manually after review; do not let build scripts replace it. Keep an internal test label until all gates pass.
