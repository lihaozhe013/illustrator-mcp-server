# Adobe AI Bridge Installer

This directory builds the macOS Tauri installer, stable Rust launcher, and bundled Illustrator and InDesign MCP runtimes. The desktop app installs or replaces both runtimes and adds the selected OpenCode and WorkBuddy client entries. Clients own the MCP process lifetime after installation.

The launcher forwards upstream MCP messages without filtering tools. Runtime packages add `execute_jsx` to both engines. The InDesign panel connects through the existing authenticated loopback proxy; Creative Cloud approval is manual.

## Development

Requirements: Apple Silicon macOS, Rust with `aarch64-apple-darwin`, Node and pnpm 12.9.1, uv, Python 3.12, and Xcode Command Line Tools.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm bundle:runtimes
pnpm --dir apps/desktop tauri dev
```

Create the combined local DMG with `pnpm build:dmg`. Patched upstream sources and build outputs are generated under ignored runtime directories. The tracked upstream snapshots remain unchanged.
