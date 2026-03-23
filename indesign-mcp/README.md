# InDesign MCP

**Control Adobe InDesign with AI.** 99 tools exposed to any MCP-capable AI client
(Claude Desktop, OpenAI Agent SDK, ...) — layout, typography, styles, GREP
find/change, master pages, tables, TOC/index, templates & data merge, export &
preflight. Live-verified against InDesign 2026.

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE.md)
[![Latest release](https://img.shields.io/github/v/release/Rinellasky/indesign-mcp)](https://github.com/Rinellasky/indesign-mcp/releases/latest)

> Extended from [mikechambers/adb-mcp](https://github.com/mikechambers/adb-mcp) (MIT).
> Not endorsed by or affiliated with Adobe.

## What you can do

- Build complete documents from a prompt: *"lay out a 4-page newsletter with a 2-column
  grid, running headers, and auto page numbers"*
- Typography at scale: create and apply paragraph/character/object styles, GREP
  restyling across a whole document, drop caps, baseline grids
- Publishing pipeline work: tables of contents, indexes, cross-references, data merge,
  books (.indb), PDF/IDML/EPUB export, preflight, print packaging
- Template population: fill named frames with text and images from structured data

## How it works

```
AI client  <->  MCP server (.dxt)  <->  proxy (localhost:3001)  <->  UXP plugin  <->  InDesign
```

Three pieces, all included in every [release](https://github.com/Rinellasky/indesign-mcp/releases/latest):

| File | What it is |
|---|---|
| `indesign-mcp.dxt` | MCP server — **double-click to install into Claude Desktop** |
| `indesign-mcp-plugin.ccx` | InDesign UXP plugin — double-click, Creative Cloud installs it |
| `adb-proxy-socket-win-x64.exe` | Prebuilt proxy server (Windows) |
| `adb-proxy-socket-macos-x64` / `-arm64` | Prebuilt proxy server (macOS Intel / Apple Silicon) |

The proxy is required because UXP plugins can only connect *out* to a socket — they
can't listen as a server — so it bridges the MCP server and the plugin.

## Install

### One line (Windows)

```powershell
irm https://raw.githubusercontent.com/Rinellasky/indesign-mcp/main/install/install.ps1 | iex
```

Installs the MCP server into Claude Desktop, downloads the proxy, and installs the
InDesign plugin (via Creative Cloud). Two manual steps remain: start the proxy, and
click **Connect** in InDesign's *InDesign MCP Agent* panel.

### Manual (Windows & macOS, 3 steps)

1. **MCP server** — download `indesign-mcp.dxt` from the
   [latest release](https://github.com/Rinellasky/indesign-mcp/releases/latest),
   double-click it, then restart Claude Desktop.
   Requires [`uv`](https://docs.astral.sh/uv/) on PATH.
2. **Proxy** — run `adb-proxy-socket-win-x64.exe` (Windows) or
   `chmod +x ./adb-proxy-socket-macos-arm64 && ./adb-proxy-socket-macos-arm64` (macOS).
   Leave it running — you should see `Command proxy server running on ws://localhost:3001`.
3. **InDesign plugin** — double-click `indesign-mcp-plugin.ccx` (Creative Cloud
   installs it). In InDesign, open **Plugins → InDesign MCP Agent** and click **Connect**.

### Let an AI install it for you

Point any agent with shell access (Claude Desktop, Cowork, Claude Code, ...) at
[`install/INSTALL_VIA_AI.md`](install/INSTALL_VIA_AI.md):

> *Follow https://github.com/Rinellasky/indesign-mcp/blob/main/install/INSTALL_VIA_AI.md and install the InDesign MCP for me*

## Requirements

- Adobe InDesign 20.2 (2025/2026) or newer
- An MCP-capable AI client (tested with Claude Desktop on Windows & macOS)
- [`uv`](https://docs.astral.sh/uv/) on PATH (the MCP server runs on Python via uv)

## Using it

1. Start the proxy, connect the plugin panel in InDesign, launch your AI client.
2. **Load the instructions resource first** — in Claude Desktop, click **+** in the
   chat input → *Add from Adobe InDesign* → `config://get_instructions`. This primes
   the AI with usage guidance and sharply reduces errors.
3. Prompt in natural language — no API names needed:

```
Create a letter-size document with a 2-column text layout and a headline in Bold
Thread these overflowing text frames onto a new page
Create a paragraph style "Body" (11pt, 14pt leading) and apply it to the whole story
Replace all double spaces with single spaces using GREP
Build a table of contents from my Heading styles
Export pages 1-4 as a print-ready PDF
```

### Tips

- The AI can pull any page as an image (`get_page_image`) and visually check its work — ask it to.
- Every text mutation reports overset state per frame, so the AI knows when text overflows.
- Long exports (PDF/EPUB/package) can outlive the tool-call timeout and still succeed —
  check the output file before retrying.

## The 99 tools, briefly

| Area | Coverage |
|---|---|
| Layout foundation | document lifecycle, deep document read, page previews, pages/layers/guides, text frames + threading with overset reporting, shapes, swatches, images, transforms |
| Typography engine | paragraph/character/object styles (upsert + groups), GREP find/change with backreferences, master pages, tables (header rows, alternating fills, cell styles), drop caps, bullets, baseline grid, text wrap, anchored objects |
| Publishing pipeline | TOC, sections, hyperlinks/bookmarks/cross-references, index, books (.indb), named-frame template population, data merge, snippets, print + interactive PDF, IDML, EPUB, per-page image export, preflight profiles, print packaging |
| Orchestration | persisted action sequences, align/distribute, multi-document tools, cross-document GREP restyling |

Ask the AI *"list what functions are available for working with InDesign"* for the full inventory.

## Troubleshooting

- **MCP won't start in Claude** — put an absolute path to `uv` in the Claude config.
- **Plugin won't connect** — make sure InDesign is running first and the proxy is up.
  If the button still says "Connect", the proxy isn't reachable on port 3001.
- **Every command errors "Requires an open InDesign document"** — open or create a
  document first.
- **Everything suddenly times out** — check for a blocking OS/InDesign dialog
  (e.g. a "pick an app" dialog after an export); dismissing it recovers instantly.

Still stuck? [Open an issue](https://github.com/Rinellasky/indesign-mcp/issues) with your
OS, InDesign version, and any errors.

## Source & credits

This repository distributes the packaged releases. The shipped `.dxt` and `.ccx` contain
the complete, unminified server (Python) and plugin (JavaScript) code. Built on
[Mike Chambers' adb-mcp](https://github.com/mikechambers/adb-mcp) proof of concept —
the proxy architecture started there; the InDesign integration was built out from a
1-tool stub to the full 99-tool suite.

Released under the [MIT License](LICENSE.md). Adobe and InDesign are trademarks of
Adobe Inc.; this project is unofficial and not affiliated with or endorsed by Adobe.
