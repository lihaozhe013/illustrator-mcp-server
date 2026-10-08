# Manual Adobe and Client E2E Checklist

Mock checks do not count as a real Adobe or client connection. Record macOS, Illustrator, InDesign, Creative Cloud, OpenCode, WorkBuddy, manager, and runtime versions for each real run.

1. Install the internal DMG on an Apple Silicon Mac and accept the macOS prompt. Unsigned engineering builds are not suitable for clean-user acceptance.
2. Select the intended OpenCode and/or WorkBuddy clients and run Install / Update. Confirm both runtimes and the InDesign proxy install. Repeat at the same version and after a version change; confirm each runtime directory contains only the active version and unrelated client JSONC settings remain intact.
3. If using InDesign, open the panel setup action, approve the CCX installation in Creative Cloud, open the Adobe AI Bridge panel, paste the copied token, and connect.
4. In both clients, reconnect and verify MCP initialize, exactly 67 Illustrator tools and 100 InDesign tools, including `open_document`, `save_document`, editing/export tools, and `execute_jsx`. Confirm stdio contains only JSON-RPC messages.
5. With disposable test documents, open a document, create an object, edit text, save, export, and run a JSX script that performs a combined edit. Verify the visible result in each Adobe app. Do not use customer documents for acceptance testing.
6. In Illustrator, test `document` and `artboard` native conversions plus `artboard-web` on the origin artboard, a second artboard, and an offset artboard. Check round trips against actual object positions and confirm the returned rectangle, ruler origin, and point units.
7. Trigger a bounded InDesign timeout and a plugin disconnect. Confirm the result is an MCP error that marks the outcome as unknown, no command is automatically replayed, and a later command is accepted.
8. Close Tauri and continue calling both bridges from the clients. Restart Adobe apps, clients, and the Mac, then confirm InDesign proxy and UXP reconnect behavior.

Save sanitized results and useful hashes. Do not include customer document text, client credentials, or the UXP token in the transcript.
