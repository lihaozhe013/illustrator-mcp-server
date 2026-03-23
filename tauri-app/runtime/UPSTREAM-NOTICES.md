# Third-Party Notices

## Rinellasky InDesign MCP v1.2.1

MCP server source and upstream repository license: MIT License. Copyright (c) 2025 Mike Chambers and 2025–2026 Rinellasky (extensions). See `upstream/rinellasky-LICENSE.md` and the copyright headers retained in the extracted source.

The upstream InDesign UXP panel source distributed in `upstream/indesign-mcp-plugin` includes the Apache License, Version 2.0, in `LICENSE` and in the release artifact. Preserve this notice when building or distributing the plugin.

## Mike Chambers Socket.IO proxy source

The inspected source commit is `afe5d09cdbdd4cc60434dce6b3f46fdafe15a21c`. The proxy uses the upstream Express and Socket.IO packages listed in `upstream/adb-proxy-socket/package.json` and locked by `upstream/adb-proxy-socket/package-lock.json`. Its MIT notice is retained in `upstream/LICENSE.md`.

The hardened bridge proxy is an isolated, protocol-compatible application maintained in `runtime/proxy/server.mjs`. It uses the pinned upstream Express and Socket.IO modules; it does not distribute the upstream proxy binary.

Every PyInstaller, Node, Rust, frontend, and transitive dependency license must be added to the packaged notices before distribution.
