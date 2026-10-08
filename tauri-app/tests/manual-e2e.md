# Manual Adobe and Client E2E Checklist

Status on 2026-10-08: `BLOCKED` for real Adobe operations and client handshakes. The running manager detected Illustrator 30.3.0 and InDesign 21.0.0.192 with their full bundle paths, and both installed-version lists were inspected. No UXP approval, real document operation, or manager registration test has been performed. Do not treat mock tests as completion evidence.

On each supported clean Apple Silicon user account, record macOS, Illustrator, InDesign, Creative Cloud, WorkBuddy, OpenCode, manager, and runtime versions.

1. For release acceptance, install the internally signed and notarized DMG, move the app to Applications, and accept only explicit macOS and Creative Cloud prompts. The current unsigned engineering build is not suitable for clean-user acceptance.
2. Confirm the manager detects each installed Adobe app and client. Install only one runtime, verify it, then install the second and verify failure isolation.
3. Start the InDesign proxy, copy its token through the manager, install the UXP package through Creative Cloud, and connect the panel. Confirm one authenticated plugin session and proxy health.
4. Configure the four independent client/engine entries. Verify MCP initialize, tools/list, and benign document metadata in each real client. Close the GUI and verify the client-managed processes still work.
5. Keep the current build read-only. Before enabling template operations in a future release, create a disposable `.ai` and `.indd` fixture, record source SHA-256, exercise dry-run and copy-on-write replacement with CJK and empty text, verify styles/locks/links/fonts/overset, export PDF, and confirm source hashes remain unchanged.
6. Exercise duplicate names, locked objects, overlong text, missing fonts/links, timeout, and disconnect. Confirm unknown outcomes are not replayed and invalid outputs are not committed.
7. Restart each Adobe app, proxy, clients, and Mac. Confirm proxy recovery and ensure unrelated processes remain untouched.
8. Apply and remove manager-owned config entries; confirm unrelated JSONC comments/settings remain. Upgrade, roll back, uninstall one engine, then the other; verify shared resources survive until unused.

Save sanitized outputs and useful hashes. Never include customer document text, client secrets, or the UXP token in the transcript.
