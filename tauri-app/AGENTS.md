# Adobe AI Bridge — Manager Agent Instructions

This directory contains the independent macOS Tauri manager for Illustrator and InDesign. Read the repository-root `SPEC.md` and this file before changing production code. The original Illustrator MCP author's `illustrator-mcp/CLAUDE.md` governs only that upstream snapshot and does not govern the manager.

## Project rules

- Follow the SPEC milestones in order. Keep upstream integration patches isolated and record verified facts, test results, and blockers in the technical documentation.
- Write all new source comments, documentation, UI text, and project files in English. Do not introduce Chinese or emoji text into project files.
- Keep manager wrappers and patches in this directory. Do not make unnecessary changes to either upstream; verify Illustrator changes from `illustrator-mcp/` and InDesign release changes through the pinned preparation scripts.
- Never install an Adobe UXP extension silently or bypass Creative Cloud approval. Report installation as verified only after a successful plugin connection.
- Bind the proxy exclusively to `127.0.0.1`. Do not forward document data to vendor endpoints or log full document text.
- Preserve customer documents and unrelated agent settings. Use working copies, transactional configuration updates, backups, and rollback.
- Keep the packaged runtime self-contained. Do not depend on the user's Python, Node, uv, Homebrew, or shell startup files.
- Distinguish unit tests, mock integration tests, and real InDesign/UXP/client tests. Label tests that require unavailable user interaction or authorization as `BLOCKED`.
- Keep default designer operations allow-listed; never expose arbitrary JSX/UXP execution by default.
