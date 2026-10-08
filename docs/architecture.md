# Architecture

Adobe AI Bridge is a small installer around the existing Illustrator and InDesign MCP servers.

## Runtime path

```text
OpenCode or WorkBuddy → adobe-mcp-launcher → upstream MCP runtime → Adobe application
```

The Rust launcher resolves the app-owned runtime and forwards MCP stdio lines without changing tool inventories or calls. Illustrator uses its existing ExtendScript executor. InDesign uses its packaged upstream MCP, a manager-owned authenticated proxy on `127.0.0.1:3001`, and the approved UXP panel. The Tauri app only needs to run for installation and initial client configuration.

Both engines expose their complete upstream tool inventories plus `execute_jsx`: 67 Illustrator tools and 100 InDesign tools. JSX takes source code, optional JSON parameters, and a timeout from 1 to 300 seconds (60 seconds by default). Results are returned as JSON. A timeout is surfaced as an error with an uncertain-outcome notice; the bridge does not retry it.

## Runtime installation

One Install / Update action stages full copies of the shared Node runtime and both engines, validates their manifests, atomically switches the `current` pointers, removes older app-owned runtime directories, and restarts the InDesign proxy. Runtime updates do not copy or back up Adobe documents. They preserve client configuration, unrelated settings, and the InDesign connection token.

Selected client entries are merged into the existing JSONC files using the existing config helpers and an atomic write. Conflicting entries are preserved and reported. Once installed, the MCP processes are started by the clients and do not depend on the Tauri app remaining open.

## Coordinates

Illustrator native `document` and `artboard` meanings are preserved. The additional `artboard-web` system uses the selected artboard's actual rectangle `[left, top, right, bottom]` in points:

```text
x = document_x - left
y = top - document_y
```

The coordinate tools and document metadata return the raw artboard rectangle and ruler origin. The active artboard is used by default; `artboard_index` selects a different artboard for `artboard-web` conversion.

## Integrity and limits

The upstream snapshots remain unchanged. Build scripts copy pinned sources into ignored staging directories and apply manager-owned patches there. Runtime manifests hash every packaged file. The InDesign proxy remains on loopback, authenticates the UXP panel with a private token, correlates requests, serializes Adobe calls, and removes document content from logs.

JSX is trusted local code and receives the Adobe application's access; it is not sandboxed. Real Illustrator, InDesign, OpenCode, and WorkBuddy behavior is tracked separately from mocks. See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) and [`compatibility-matrix.md`](compatibility-matrix.md).
