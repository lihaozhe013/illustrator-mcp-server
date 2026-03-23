# Known Limitations

- The Tauri app builds an unsigned Apple Silicon DMG, but clean-user installation is blocked until a real Developer ID signature and notarization are available.
- Adobe Illustrator 30.3.0 and InDesign 21.0.0.192 are installed on the development Mac. Neither engine has completed a real document operation. InDesign UXP has not been approved or connected in Creative Cloud.
- OpenCode v2.0.24 and WorkBuddy v5.7.6 are present, but neither has completed a real launch/initialize/tools/list handshake against the manager. Existing user configs were not changed during development.
- The current default tool allowlist is read-only. Safe template inspection/replacement, format and overset validation, PDF export/preview, and transaction commit are not implemented.
- InDesign proxy lifecycle has a per-user LaunchAgent. Illustrator's stdio MCP is launched on demand by its client. Per-engine runtime install, rollback, and uninstall actions are implemented, but upgrade/rollback/uninstall behavior has not yet had a full system-level lifecycle test. Private Unix-socket manager IPC is not implemented.
- Client config preview, apply, exact-entry removal, atomic write, and backup logic are present; schema behavior and reversible changes still need tests against real client versions.
- The InDesign UXP permission manifest restricts network access to the local proxy but still requests `localFileSystem: fullAccess`; Creative Cloud must explicitly approve it.
- Two clean Apple Silicon user environment validation has not been performed.
