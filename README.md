# Adobe AI Bridge

Adobe AI Bridge is a lightweight macOS installer and MCP bridge for Adobe Illustrator and Adobe InDesign. One `Install / Update` action installs both complete runtimes and configures the selected OpenCode and Tencent WorkBuddy clients. Once installed, clients start the MCP servers directly and continue working after the Tauri app closes.

The bridge exposes every upstream tool plus `execute_jsx` (67 Illustrator tools and 100 InDesign tools). Agents can open, edit, save, export, and run trusted scripts in the Adobe applications. JSX is local code with the same application access as the user and has no sandbox.

The project is an internal engineering build. Real Adobe operations and real client handshakes are recorded separately from mock tests. The InDesign UXP panel still requires a user to approve installation through Creative Cloud. See [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) and [`tauri-app/tests/manual-e2e.md`](tauri-app/tests/manual-e2e.md).

## Build

```sh
cd tauri-app
pnpm install --frozen-lockfile
pnpm verify
pnpm build:dmg
```

Run the upstream Illustrator regression suite from `illustrator-mcp/`. The tracked InDesign snapshot is manually synchronized after review; its runtime implementation is built from checksum-pinned release packages.

## Project structure

- [`illustrator-mcp/`](illustrator-mcp/): tracked Illustrator MCP upstream source and tests.
- [`indesign-mcp/`](indesign-mcp/): tracked InDesign upstream snapshot. See [`docs/indesign-upstream-sync.md`](docs/indesign-upstream-sync.md).
- [`tauri-app/`](tauri-app/): installer, launcher, runtime build patches, and tests.
- [`docs/`](docs/): architecture, compatibility, release, and limitation records.

Adobe AI Bridge is an independent internal tool and is not affiliated with Adobe.
