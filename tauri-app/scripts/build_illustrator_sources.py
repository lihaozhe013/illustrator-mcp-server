#!/usr/bin/env python3
"""Create the manager's patched Illustrator build without changing the upstream snapshot."""

from __future__ import annotations

import shutil
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = APP_ROOT.parent
SOURCE = REPOSITORY_ROOT / "illustrator-mcp"
BUILD_ROOT = APP_ROOT / "runtime" / "build" / "illustrator"
PATCHED_SOURCE = BUILD_ROOT / "illustrator-mcp"


def replace_once(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise SystemExit(f"Expected one upstream patch anchor in {label}; found {count}.")
    return text.replace(before, after, 1)


def prepare_sources() -> Path:
    if BUILD_ROOT.exists():
        shutil.rmtree(BUILD_ROOT)
    BUILD_ROOT.mkdir(parents=True)
    shutil.copytree(
        SOURCE,
        PATCHED_SOURCE,
        ignore=shutil.ignore_patterns(".git", "node_modules", "dist", "test"),
    )

    registry_path = PATCHED_SOURCE / "src/tools/registry.ts"
    registry = registry_path.read_text(encoding="utf-8")
    registry = replace_once(
        registry,
        "import { register as registerConvertCoordinate } from './read/convert-coordinate.js';\n",
        "import { register as registerConvertCoordinate } from './read/convert-coordinate.js';\n"
        "import { register as registerExecuteJsx } from './utility/execute-jsx.js';\n",
        "Illustrator registry imports",
    )
    registry = replace_once(
        registry,
        "  registerConvertCoordinate(server);\n",
        "  registerConvertCoordinate(server);\n  registerExecuteJsx(server);\n",
        "Illustrator registry registration",
    )
    registry_path.write_text(registry, encoding="utf-8")

    coordinate_path = PATCHED_SOURCE / "src/tools/read/convert-coordinate.ts"
    coordinate = coordinate_path.read_text(encoding="utf-8")
    start = coordinate.index("    var fromMap = {")
    end = coordinate.index("  } catch (e) {", start)
    coordinate = coordinate[:start] + '''    var artboardIndex = (params.artboard_index == null)
      ? doc.artboards.getActiveArtboardIndex() : params.artboard_index;
    if (artboardIndex < 0 || artboardIndex >= doc.artboards.length) {
      writeResultFile(RESULT_PATH, { error: true, message: "Invalid artboard_index." });
    } else {
      var rect = doc.artboards[artboardIndex].artboardRect;
      var input = [params.point.x, params.point.y];
      var docPoint;
      if (params.from === "document") {
        docPoint = input;
      } else if (params.from === "artboard-web") {
        docPoint = [rect[0] + input[0], rect[1] - input[1]];
      } else if (params.from === "artboard") {
        docPoint = doc.convertCoordinate(input, CoordinateSystem.ARTBOARDCOORDINATESYSTEM, CoordinateSystem.DOCUMENTCOORDINATESYSTEM);
      } else {
        writeResultFile(RESULT_PATH, { error: true, message: "Use document, artboard, or artboard-web." });
      }
      if (docPoint) {
        var result;
        if (params.to === "document") {
          result = docPoint;
        } else if (params.to === "artboard-web") {
          result = [docPoint[0] - rect[0], rect[1] - docPoint[1]];
        } else if (params.to === "artboard") {
          result = doc.convertCoordinate(docPoint, CoordinateSystem.DOCUMENTCOORDINATESYSTEM, CoordinateSystem.ARTBOARDCOORDINATESYSTEM);
        } else {
          writeResultFile(RESULT_PATH, { error: true, message: "Use document, artboard, or artboard-web." });
        }
        if (result) writeResultFile(RESULT_PATH, { x: result[0], y: result[1], from: params.from, to: params.to, artboardIndex: artboardIndex, artboardRect: rect, unit: "pt" });
      }
    }
''' + coordinate[end:]
    coordinate_enum = "          .enum(['artboard', 'document'])"
    if coordinate.count(coordinate_enum) != 2:
        raise SystemExit("Expected two coordinate system schemas in the pinned Illustrator source.")
    coordinate = coordinate.replace(
        coordinate_enum,
        "          .enum(['artboard', 'document', 'artboard-web'])",
        1,
    )
    coordinate = replace_once(
        coordinate,
        "          .describe('Source coordinate system'),\n",
        "          .describe('Source coordinate system: artboard-web starts at the selected artboard top-left and uses positive Y down.'),\n        artboard_index: z.number().int().min(0).optional().describe('Artboard index; defaults to the active artboard.'),\n",
        "Illustrator coordinate source description",
    )
    coordinate = replace_once(
        coordinate,
        '          .enum([\'artboard\', \'document\'])',
        '          .enum([\'artboard\', \'document\', \'artboard-web\'])',
        "Illustrator coordinate destination schema",
    )
    coordinate = replace_once(
        coordinate,
        "          .describe('Destination coordinate system'),\n",
        "          .describe('Destination coordinate system: artboard-web starts at the selected artboard top-left and uses positive Y down.'),\n",
        "Illustrator coordinate destination description",
    )
    coordinate_path.write_text(coordinate, encoding="utf-8")

    document_path = PATCHED_SOURCE / "src/tools/read/get-document-info.ts"
    document = document_path.read_text(encoding="utf-8")
    document = replace_once(
        document,
        "        name: ab.name\n",
        "        name: ab.name,\n        artboardRect: rect,\n        rulerOrigin: ab.rulerOrigin,\n        unit: \"pt\"\n",
        "Illustrator document artboard metadata",
    )
    document = replace_once(
        document,
        "      coordinateSystem: coordSystem\n",
        "      coordinateSystem: coordSystem,\n"
        "      coordinateContext: {\n"
        "        unit: \"pt\",\n"
        "        currentCoordinateSystem: coordSystem,\n"
        "        documentRulerOrigin: doc.rulerOrigin,\n"
        "        nativeArtboardRectOrder: \"[left, top, right, bottom]\",\n"
        "        artboardWeb: { origin: \"selected artboard top-left\", positiveY: \"down\", mapping: \"x = left + x; y = top - y\" }\n"
        "      }\n",
        "Illustrator document coordinate metadata",
    )
    document_path.write_text(document, encoding="utf-8")

    artboards_path = PATCHED_SOURCE / "src/tools/read/get-artboards.ts"
    artboards = artboards_path.read_text(encoding="utf-8")
    artboards = replace_once(
        artboards,
        "        name: ab.name,\n        position: {},\n",
        "        name: ab.name,\n"
        "        artboardRect: rect,\n"
        "        rulerOrigin: ab.rulerOrigin,\n"
        "        unit: \"pt\",\n"
        "        position: {},\n",
        "Illustrator artboard coordinate metadata",
    )
    artboards = replace_once(
        artboards,
        "writeResultFile(RESULT_PATH, { coordinateSystem: coordSystem, artboards: artboards });",
        "writeResultFile(RESULT_PATH, {\n"
        "      coordinateSystem: coordSystem,\n"
        "      coordinateContext: {\n"
        "        unit: \"pt\",\n"
        "        currentCoordinateSystem: coordSystem,\n"
        "        nativeArtboardRectOrder: \"[left, top, right, bottom]\",\n"
        "        artboardWeb: { origin: \"each artboard top-left\", positiveY: \"down\", mapping: \"x = left + x; y = top - y\" }\n"
        "      },\n"
        "      artboards: artboards\n"
        "    });",
        "Illustrator artboard coordinate context",
    )
    artboards_path.write_text(artboards, encoding="utf-8")

    script_path = PATCHED_SOURCE / "src/tools/utility/execute-jsx.ts"
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(
        """import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeJsx } from '../../executor/jsx-runner.js';
import { formatToolResult } from '../tool-executor.js';
import { DESTRUCTIVE_ANNOTATIONS } from '../modify/shared.js';

const jsxCode = (code: string) => `
var payload = readParamsFile(PARAMS_PATH);
try {
  var value = (function(params) {
` + code + `
  }).call(app, payload.params || {});
  if (value === undefined) value = { success: true };
  writeResultFile(RESULT_PATH, value);
} catch (e) {
  writeResultFile(RESULT_PATH, { error: true, message: e.message, line: e.line });
}
`;

export function register(server: McpServer): void {
  server.registerTool(
    'execute_jsx',
    {
      title: 'Execute JSX',
      description: 'Execute trusted ExtendScript JSX in the active Illustrator application. The script has the same local file and application access as the user and can directly modify open documents. Return JSON-compatible data or omit a return value.',
      inputSchema: {
        code: z.string().min(1).describe('ExtendScript JSX source code.'),
        params: z.record(z.string(), z.unknown()).optional().describe('JSON values exposed to the script as the params argument.'),
        timeout_ms: z.number().int().min(1000).max(300000).optional().default(60000).describe('Execution timeout in milliseconds; a timeout does not guarantee that Illustrator stopped running the script.'),
      },
      annotations: DESTRUCTIVE_ANNOTATIONS,
    },
    async ({ code, params, timeout_ms }) => {
      const script = jsxCode(code);
      try {
        return formatToolResult(await executeJsx(script, { params }, { timeout: timeout_ms, activate: true }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolResult({ error: true, outcomeUnknown: /timed? ?out|timeout/i.test(message), message });
      }
    },
  );
}
""",
        encoding="utf-8",
    )

    package_path = PATCHED_SOURCE / "package.json"
    package = package_path.read_text(encoding="utf-8")
    package_path.write_text(package, encoding="utf-8")
    return PATCHED_SOURCE


if __name__ == "__main__":
    print(f"Prepared patched Illustrator source copy: {prepare_sources()}")
