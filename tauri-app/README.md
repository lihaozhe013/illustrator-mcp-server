# Adobe AI Bridge Manager

This is the macOS Tauri 2 application and runtime build project for independently managing the Adobe Illustrator and Adobe InDesign MCP engines.

Read the repository-root `SPEC.md` and `AGENTS.md` before implementation. New manager source, UI, and documentation are written in English. Real Adobe and real client checks are reported separately from unit and mock integration tests.

## Development

Requirements: Apple Silicon macOS, Rust with `aarch64-apple-darwin`, Node and pnpm 12.9.1, uv, Python 3.12, and Xcode Command Line Tools.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm bundle:runtimes
pnpm --dir apps/desktop tauri dev
```

Create the combined local DMG with `pnpm build:dmg`. Runtime sources, app bundles, and build caches are generated under ignored directories. The tracked InDesign Git snapshot is manually synchronized and hash-verified; Python/UXP runtime code is taken from pinned DXT/CCX release artifacts. The current DMG is unsigned and intended only for engineering inspection.

## Current boundary

The default launcher exposes reviewed read tools only. Template write operations are not enabled until the copy, validation, and commit transaction is implemented and tested against both Adobe applications. See root `docs/KNOWN_LIMITATIONS.md` and `docs/compatibility-matrix.md`.
