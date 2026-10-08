# Runtime Risks

Updated: 2026-10-08.

| Risk | Effect | Mitigation / status |
|---|---|---|
| Full upstream editing tools and JSX are exposed | Agent calls can make direct document changes or run arbitrary local scripts through Adobe | This is the intended trusted-agent model. JSX is described as unsandboxed local code. The agent chooses save, copy, and undo behavior. |
| UXP requires `localFileSystem: fullAccess` and Creative Cloud approval | InDesign panel setup cannot be fully automated | The package restricts network access to `http://127.0.0.1:3001`; the installer opens the package and copies a token, while the user approves and connects the panel. |
| Local port 3001 may already be occupied | The InDesign proxy cannot start | Bind only to loopback, report the conflict, and never terminate an unrelated process. |
| UXP disconnect or timeout during an edit leaves the document state uncertain | Repeating an edit may duplicate its effect | Report `outcomeUnknown`, do not retry automatically, and allow later calls so the agent can inspect the document and decide. |
| Client config entries may conflict or client schemas may change | A client may not start the configured bridge | Preserve conflicting entries, report the issue, retain JSONC comments and unrelated settings, and verify each client handshake separately. |
| Runtime staging or pointer replacement is interrupted | A bridge may fail to start until installation is rerun | Copy to a unique staging directory, validate hashes, atomically replace the current pointer, then prune old app-owned directories. Same-version reinstall follows the same path. |
| No Developer ID signing identity is available | macOS trust prompts prevent clean-user installation | Current DMG is internal and unsigned; signing and notarization remain separate release gates. |
| Tracked source differs from the packaged sources | Runtime provenance becomes unclear | Pin upstream commits and release checksums, verify manifests, and patch only ignored build copies. |
