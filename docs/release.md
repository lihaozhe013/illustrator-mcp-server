# Release and Local Build

The supported target is macOS Apple Silicon (`aarch64-apple-darwin`). Build from `tauri-app/` with `pnpm install --frozen-lockfile`, `pnpm verify`, then `pnpm build:dmg`. The runtime builder downloads only checksum-pinned Node and upstream release inputs, stages and patches InDesign code, builds arm64 Python/Node resources, creates hash manifests, and asks Tauri to embed both engines in one DMG.

On 2026-10-08 the runtime bundle build and Tauri DMG bundle completed locally. `pnpm verify:dmg` validated the DMG filesystem, 6,618 engine resource hashes, two shared Node runtime hashes, license files, and arm64 Mach-O binaries. The generated DMG is 93.11 MiB (96M on disk), unsigned, with SHA-256 `730d96584c4700148008cb2eaccabaa530002242d839a00949c3ae5c64a10665`. It is an engineering artifact; do not describe it as ready for clean-user installation.

Before a signed internal release:

1. Run `pnpm install --frozen-lockfile` and `pnpm verify` from `tauri-app/`, plus the Illustrator upstream build/test from `illustrator-mcp/`.
2. Rebuild the pinned runtimes, confirm their manifests and license notices, inspect Mach-O architecture, and run `pnpm verify:dmg` (also included in `pnpm build:dmg`).
3. Complete real InDesign/UXP and Illustrator working-copy tests, then verify the four OpenCode/WorkBuddy × engine connections.
4. Exercise per-engine upgrade, rollback, uninstall, app relocation, GUI closure, and clean PATH behavior. The per-engine install, rollback, and uninstall actions exist; full system-level lifecycle and clean-user tests remain outstanding.
5. Sign nested executables before the app with the actual Developer ID; notarize and verify the ticket. No signing identity is currently available.
6. Run the manual checklist on two clean Apple Silicon user accounts; record app, client, Adobe, and runtime versions, without retaining customer content or credentials.

Never check in generated bundles, signing secrets, or customer configuration. The tracked InDesign Git snapshot is updated manually after review; do not let build scripts replace it. Keep an internal test label until all gates pass.
