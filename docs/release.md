# Release and Local Build

The supported target is macOS Apple Silicon (`aarch64-apple-darwin`). Build from `tauri-app/` with `pnpm install --frozen-lockfile`, `pnpm verify`, then `pnpm build:dmg`. The runtime builder downloads only checksum-pinned Node and upstream release inputs, stages and patches InDesign code, builds arm64 Python/Node resources, creates hash manifests, and asks Tauri to embed both engines in one DMG.

The version 0.1.0 DMG was built on 2026-10-08 with SHA-256 `8c9ed1caaaec01cc962371016aacbeeef46039e0aa5c6e7d02cec5142130509c` (97,525,516 bytes). It was unsigned and did not establish real client or Adobe connectivity.

Version 0.1.1 validation on 2026-10-08 passed `pnpm verify`: 16 Vitest tests, 4 Python tests, and 24 Rust tests (22 core and 2 launcher), plus the separate Illustrator upstream suite of 608 tests across 34 files. The runtime bundles rebuilt successfully. `pnpm build:dmg` produced `tauri-app/target/release/bundle/dmg/Adobe AI Bridge_0.1.1_aarch64.dmg`; `pnpm verify:dmg` validated 3,833 Illustrator resources, 2,787 InDesign resources, two shared Node runtime resources, license files, launcher, and arm64 binaries. The DMG is 93.08 MiB (97,598,874 bytes), unsigned, with SHA-256 `806179e305b42c7444f01c22999808f813dd830b04b2986d3502ba45b80613b1`. Clean-user installation, target-machine WorkBuddy handshake, signing, notarization, and real Adobe editing remain unverified.

Before a signed internal release:

1. Run `pnpm install --frozen-lockfile` and `pnpm verify` from `tauri-app/`, plus the Illustrator upstream build/test from `illustrator-mcp/`.
2. Rebuild the pinned runtimes, confirm their manifests and license notices, inspect Mach-O architecture, and run `pnpm verify:dmg` (also included in `pnpm build:dmg`).
3. Complete real InDesign/UXP and Illustrator working-copy tests, then verify the four OpenCode/WorkBuddy × engine connections.
4. Exercise first install, same-version replacement, and upgrade. Confirm old app-owned runtime directories are removed, client settings are preserved, the InDesign proxy restarts, and both clients continue working after the GUI closes. This installer has no rollback or runtime-management screen.
5. Sign nested executables before the app with the actual Developer ID; notarize and verify the ticket. No signing identity is currently available.
6. Run the manual checklist on two clean Apple Silicon user accounts; record app, client, Adobe, and runtime versions, without retaining customer content or credentials.

## Version 0.1.1 first-install regression

The 0.1.1 installer reports successful runtime installations separately from InDesign proxy readiness. A proxy timeout must not prevent selected client entries for successfully installed bridges from being written. Client selection is initialized from bounded, read-only detection; only detected clients are selected by default, and manual selection remains available. Unit and integration mocks cover a WorkBuddy-only installation, an OpenCode config failure that does not stop WorkBuddy, delayed proxy readiness, proxy timeout, and a partial runtime install. Run a clean WorkBuddy-only account on the recipient Mac before treating the real-client connection as verified.

The DMG verifier selects the artifact matching the version in `tauri.conf.json`, so older versioned DMGs in the output directory do not prevent checking a new release.

Never check in generated bundles, signing secrets, or customer configuration. The tracked InDesign Git snapshot is updated manually after review; do not let build scripts replace it. Keep an internal test label until all gates pass.
