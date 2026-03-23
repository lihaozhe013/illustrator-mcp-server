# Manual InDesign Upstream Sync

`indesign-mcp/` is a normal directory tracked by the Adobe AI Bridge repository. It is a reviewed snapshot of `Rinellasky/indesign-mcp` at the commit in `tauri-app/runtime/pins.lock.json`; it is not a submodule or nested Git checkout. Build and verification scripts never clone, reset, or write to it.

The pinned upstream Git tree currently contains only `LICENSE.md`, `README.md`, and two installer files under `install/`. The Python MCP and UXP panel implementation are not present in that Git tree. Runtime builds therefore continue to obtain those files from the upstream DXT and CCX release archives, whose SHA-256 values are also pinned.

To manually sync the Git snapshot:

1. Clone `https://github.com/Rinellasky/indesign-mcp` into a temporary directory outside this repository and check out the release or commit being reviewed. Keep its `.git` metadata outside the project.
2. Review the upstream commit, license and file changes. Compare its tree with `indesign-mcp/`; copy only reviewed files into the tracked snapshot. Do not run an automated reset or delete files without reviewing the diff.
3. Update `rinnellasky.commit`, `release`, and the complete `snapshotFiles` SHA-256 map in `tauri-app/runtime/pins.lock.json`. If changing runtime versions, also update the DXT/CCX URLs and hashes, derived package metadata, patches, and notices after reviewing the new release contents.
4. Run the snapshot verification and mock integration tests with `pnpm verify` from `tauri-app/`. Rebuild the runtime and DMG when release artifacts or patches changed. Review the resulting diff and record the sync in `docs/upstream-audit.md`.
5. Commit the reviewed snapshot and its matching lock metadata together.

The build rejects missing, extra, modified, or symlinked snapshot files. This catches accidental drift while leaving update timing and upstream review under maintainer control.
