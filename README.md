# Adobe AI Bridge

Adobe AI Bridge is a macOS manager for separate Illustrator and InDesign MCP servers. It configures OpenCode and Tencent WorkBuddy for either or both engines, and keeps the two upstream integrations independently installable and removable.

The manager bundles its runtimes and does not require a designer to install Node.js, Python, or developer tools. The current build is for internal engineering review. It is unsigned; the Adobe apps and clients are detected locally, but real document operations and real client handshakes have not passed. Template editing is not enabled.

## Internal build

The current Apple Silicon DMG is generated at `tauri-app/target/release/bundle/dmg/Adobe AI Bridge_0.1.0_aarch64.dmg`. macOS may refuse to open this unsigned build. Do not bypass security prompts to install it. A signed and notarized build requires a Developer ID identity.

For developers building from source:

```sh
cd tauri-app
pnpm install --frozen-lockfile
pnpm verify
pnpm build:dmg
```

Run the Illustrator upstream regression suite from `illustrator-mcp/` with `npm ci`, `npm run build`, and `npm test`. `indesign-mcp/` is a tracked upstream snapshot that is manually synchronized after review. Its repository does not contain the Python/UXP implementation; the build obtains that implementation from checksum-pinned DXT/CCX release packages.

## What is implemented

- One Tauri desktop app with separate Illustrator and InDesign runtime cards, install, rollback, and uninstall actions.
- Four independent client configuration entries: OpenCode/Illustrator, OpenCode/InDesign, WorkBuddy/Illustrator, and WorkBuddy/InDesign. Preview, backup, apply, and exact-entry removal are available.
- A bundled arm64 runtime, audited read-only MCP tool allowlists, an InDesign loopback proxy, and a UXP onboarding flow.
- Automated upstream, Rust, TypeScript, Python mock, and DMG integrity checks.

See [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) for the current real-application blockers and [`tauri-app/tests/manual-e2e.md`](tauri-app/tests/manual-e2e.md) for the acceptance checklist. Mock success does not count as Adobe or client connectivity.

## Project structure

- [`illustrator-mcp/`](illustrator-mcp/): tracked Illustrator MCP upstream snapshot, license, documentation, and tests.
- [`indesign-mcp/`](indesign-mcp/): tracked, manually synchronized InDesign upstream snapshot; runtime implementation comes from pinned release packages. See [`docs/indesign-upstream-sync.md`](docs/indesign-upstream-sync.md).
- [`tauri-app/`](tauri-app/): unified manager, runtime packaging, adapters, and tests.
- [`docs/`](docs/): shared upstream audit, architecture, compatibility, risk, release, and limitation records.

Adobe AI Bridge is an independent internal tool and is not affiliated with Adobe.
