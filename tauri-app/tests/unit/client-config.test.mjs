import { describe, expect, test } from "vitest";
import {
  createConfigPreview,
  createConfigRemovalPreview,
} from "../../packages/client-config/src/index.ts";

describe("client configuration previews", () => {
  test("preserves OpenCode V2 comments and unrelated server entries", () => {
    const source = `{
  // Existing user server
  "mcp": {"servers": {"notes": {"type": "local", "command": ["notes-mcp"]}}}
}`;
    const preview = createConfigPreview({
      client: "opencode",
      bridge: "illustrator",
      configPath: "/tmp/opencode.jsonc",
      text: source,
      launcherPath:
        "/Applications/Adobe AI Bridge.app/Contents/MacOS/adobe-mcp-launcher",
    });
    expect(preview.schema).toBe("opencode-v2");
    expect(preview.after).toContain("// Existing user server");
    expect(preview.after).toContain('"notes"');
    expect(
      JSON.parse(stripComments(preview.after)).mcp.servers[
        "illustrator-ai-bridge"
      ],
    ).toEqual({
      type: "local",
      command: [
        "/Applications/Adobe AI Bridge.app/Contents/MacOS/adobe-mcp-launcher",
        "--bridge",
        "illustrator",
      ],
      disabled: false,
    });
  });

  test("uses OpenCode stable enabled semantics and leaves an unrelated conflict untouched", () => {
    const source = `{"mcp":{"existing":{"type":"local","command":["other"]}}}`;
    const preview = createConfigPreview({
      client: "opencode",
      bridge: "indesign",
      configPath: "/tmp/opencode.json",
      text: source,
      launcherPath: "/bridge/launcher",
    });
    expect(preview.schema).toBe("opencode-stable");
    expect(JSON.parse(preview.after).mcp["indesign-ai-bridge"]).toMatchObject({
      enabled: true,
    });

    const conflict = createConfigPreview({
      client: "opencode",
      bridge: "indesign",
      configPath: "/tmp/opencode.json",
      text: JSON.stringify({
        mcp: { "indesign-ai-bridge": { command: ["user-owned"] } },
      }),
      launcherPath: "/bridge/launcher",
    });
    expect(conflict.conflict).toBe(true);
    expect(conflict.after).toBe(conflict.before);
  });

  test("builds WorkBuddy mcpServers entries and rejects malformed JSONC", () => {
    const preview = createConfigPreview({
      client: "workbuddy",
      bridge: "indesign",
      configPath: "/tmp/mcp.json",
      text: `{"mcpServers":{"existing":{"command":"notes"}}}`,
      launcherPath: "/bridge/launcher",
    });
    expect(preview.schema).toBe("workbuddy-mcpServers");
    expect(JSON.parse(preview.after).mcpServers["indesign-ai-bridge"]).toEqual({
      command: "/bridge/launcher",
      args: ["--bridge", "indesign"],
      env: {},
    });
    expect(() =>
      createConfigPreview({
        client: "workbuddy",
        bridge: "illustrator",
        configPath: "/tmp/mcp.json",
        text: "{ invalid",
        launcherPath: "/bridge/launcher",
      }),
    ).toThrow(/Invalid JSONC/);
  });

  test("removes only the selected OpenCode entry while preserving comments", () => {
    const source = `{
  // Keep this server and its comment.
  "mcp": {"servers": {
    "notes": {"type": "local", "command": ["notes-mcp"]},
    "illustrator-ai-bridge": {"type": "local", "command": ["/bridge/launcher", "--bridge", "illustrator"], "disabled": false}
  }}
}`;
    const preview = createConfigRemovalPreview({
      client: "opencode",
      bridge: "illustrator",
      configPath: "/tmp/opencode.jsonc",
      text: source,
      launcherPath: "/bridge/launcher",
    });
    expect(preview.action).toBe("remove");
    expect(preview.conflict).toBe(false);
    expect(preview.after).toContain("Keep this server and its comment.");
    expect(preview.after).toContain('"notes"');
    expect(preview.after).not.toContain("illustrator-ai-bridge");
  });
});

function stripComments(value) {
  return value.replace(/\/\/[^\n]*/g, "");
}
