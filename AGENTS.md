# Adobe AI Bridge — Repository Instructions

This repository contains two Adobe MCP upstreams and one independent Tauri manager. Read `SPEC.md` before implementation and keep the M0–M4 gates in order. New manager code, documentation, comments, UI copy, and commit messages must be in English.

## Repository boundaries

- `illustrator-mcp/` is the tracked Illustrator MCP upstream snapshot. Its `CLAUDE.md` contains the original author's Illustrator-specific development and release guidance. Preserve its source, lockfile, plugin, tests, examples, and license notices; run upstream commands from this directory.
- `indesign-mcp/` is the tracked InDesign upstream snapshot at the revision in `tauri-app/runtime/pins.lock.json`. Sync it manually after review; do not clone, reset, or rewrite it during builds. The upstream Git repository contains documentation and installers, while its Python/UXP implementation is distributed in checksum-pinned release archives.
- `tauri-app/` owns the Adobe AI Bridge manager, runtime wrappers, patch stack, tests, and builds. Keep downloaded/extracted third-party sources in its ignored runtime cache.
- Root `README.md`, `SPEC.md`, `AGENTS.md`, `docs/`, `.gitignore`, and `.github/` describe and build the combined manager. The root workflow must never run the Illustrator upstream's npm publication workflow.

## Engineering rules

- Prefer upstream implementations and small, reproducible patches. Do not move manager code into either upstream tree.
- Preserve original application documents by default. Use working copies for managed edits and do not commit an output until verification passes.
- Keep the Illustrator and InDesign engines independently installable, observable, upgradeable, recoverable, and removable.
- Bind listeners to loopback, keep interprocess sockets private, redact document contents and credentials from logs, and keep arbitrary scripting disabled in default tool registrations.
- Back up and atomically update only the app-owned OpenCode or WorkBuddy config entries. JSONC comments and unrelated settings must be preserved.
- Do not claim a real Adobe or agent-client connection from mock success. Record inaccessible Adobe permissions, Creative Cloud, client approval, signing, and notarization as explicit blockers.
- Do not publish npm packages, upstream GitHub releases, client messages, or installer artifacts to public services unless the user explicitly requests publication.
- Test meaningful changes. Run the applicable upstream, TypeScript, Rust, Python, and mock-integration checks; report exact results and blocked real-app cases.
