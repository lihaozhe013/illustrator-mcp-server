# Adobe AI Bridge Manager Instructions

This directory builds the lightweight installer and runtimes for Illustrator and InDesign. Read the repository-root `SPEC.md` and `AGENTS.md` before changing production code. The original Illustrator MCP author's `illustrator-mcp/CLAUDE.md` governs only that upstream snapshot.

## Project rules

- Follow the SPEC milestones in order. Keep manager patches reproducible and isolated to staged copies; do not modify the tracked upstream snapshots during runtime builds.
- Write source comments, documentation, UI text, and project files in English. Do not introduce Chinese or emoji text into project files.
- The Tauri app installs or replaces both complete runtimes and configures the selected OpenCode and WorkBuddy clients. Keep its UI focused on Install / Update, client selection, progress, and results.
- Forward the full upstream MCP tool surface. Expose `execute_jsx` in both runtimes as trusted local code with the Adobe application's access; do not claim it is sandboxed.
- Preserve client JSONC comments and unrelated settings. Keep the InDesign proxy on `127.0.0.1`, authenticated, and free of document-content logs.
- Do not automatically copy or back up Adobe documents. The agent chooses when to edit, save, save a copy, or undo.
- Distinguish unit tests, mock integration tests, and real Adobe/client tests. Never claim real connectivity from mock success; record Creative Cloud approval, signing, and notarization blockers explicitly.
- Keep the packaged runtimes self-contained and verify their checksums and licenses.
