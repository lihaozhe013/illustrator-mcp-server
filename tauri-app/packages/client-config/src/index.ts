import type { ParseError } from "jsonc-parser";
import { applyEdits, modify, parse, printParseErrorCode } from "jsonc-parser";

export type BridgeId = "illustrator" | "indesign";
export type ClientId = "opencode" | "workbuddy";
export type ConfigSchema =
  | "opencode-stable"
  | "opencode-v2"
  | "workbuddy-mcpServers";

export type ConfigPreview = {
  action: "install" | "remove";
  client: ClientId;
  bridge: BridgeId;
  configPath: string;
  schema: ConfigSchema;
  before: string;
  after: string;
  conflict: boolean;
  alreadyConfigured: boolean;
};

export function createConfigPreview(input: {
  client: ClientId;
  bridge: BridgeId;
  configPath: string;
  text: string;
  launcherPath: string;
}): ConfigPreview {
  const root = parse(input.text, [], {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (
    root === undefined ||
    root === null ||
    typeof root !== "object" ||
    Array.isArray(root)
  ) {
    throw new Error("The client configuration must contain a JSON object.");
  }

  const errors: ParseError[] = [];
  parse(input.text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    const first = errors[0];
    if (!first)
      throw new Error("The client configuration contains invalid JSONC.");
    throw new Error(
      `Invalid JSONC at offset ${first.offset}: ${printParseErrorCode(first.error)}.`,
    );
  }

  const { schema, path } = resolveEntryPath(
    input.client,
    input.text,
    input.bridge,
  );
  const existing = getAtPath(root, path);
  const desired = makeEntry(
    input.client,
    schema,
    input.bridge,
    input.launcherPath,
  );
  const alreadyConfigured =
    existing !== undefined &&
    stableStringify(existing) === stableStringify(desired);
  const conflict = existing !== undefined && !alreadyConfigured;
  if (conflict || alreadyConfigured) {
    return {
      action: "install",
      client: input.client,
      bridge: input.bridge,
      configPath: input.configPath,
      schema,
      before: input.text,
      after: input.text,
      conflict,
      alreadyConfigured,
    };
  }

  const edits = modify(input.text, path, desired, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  return {
    action: "install",
    client: input.client,
    bridge: input.bridge,
    configPath: input.configPath,
    schema,
    before: input.text,
    after: applyEdits(input.text, edits),
    conflict: false,
    alreadyConfigured: false,
  };
}

export function createConfigRemovalPreview(input: {
  client: ClientId;
  bridge: BridgeId;
  configPath: string;
  text: string;
  launcherPath: string;
}): ConfigPreview {
  const root = parse(input.text, [], {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (
    root === undefined ||
    root === null ||
    typeof root !== "object" ||
    Array.isArray(root)
  ) {
    throw new Error("The client configuration must contain a JSON object.");
  }

  const errors: ParseError[] = [];
  parse(input.text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    const first = errors[0];
    if (!first)
      throw new Error("The client configuration contains invalid JSONC.");
    throw new Error(
      `Invalid JSONC at offset ${first.offset}: ${printParseErrorCode(first.error)}.`,
    );
  }

  const { schema, path } = resolveEntryPath(
    input.client,
    input.text,
    input.bridge,
  );
  const existing = getAtPath(root, path);
  const expected = makeEntry(
    input.client,
    schema,
    input.bridge,
    input.launcherPath,
  );
  const missing = existing === undefined;
  const conflict =
    !missing && stableStringify(existing) !== stableStringify(expected);
  if (missing || conflict) {
    return {
      action: "remove",
      client: input.client,
      bridge: input.bridge,
      configPath: input.configPath,
      schema,
      before: input.text,
      after: input.text,
      conflict,
      alreadyConfigured: missing,
    };
  }

  const edits = modify(input.text, path, undefined, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  return {
    action: "remove",
    client: input.client,
    bridge: input.bridge,
    configPath: input.configPath,
    schema,
    before: input.text,
    after: applyEdits(input.text, edits),
    conflict: false,
    alreadyConfigured: false,
  };
}

export function resolveEntryPath(
  client: ClientId,
  text: string,
  bridge: BridgeId,
): { schema: ConfigSchema; path: Array<string | number> } {
  const root = parse(text) as Record<string, unknown> | undefined;
  const serverId = `${bridge}-ai-bridge`;
  if (client === "workbuddy") {
    return { schema: "workbuddy-mcpServers", path: ["mcpServers", serverId] };
  }

  const mcp = root?.mcp;
  if (isRecord(mcp) && isRecord(mcp.servers)) {
    return { schema: "opencode-v2", path: ["mcp", "servers", serverId] };
  }
  return { schema: "opencode-stable", path: ["mcp", serverId] };
}

function makeEntry(
  client: ClientId,
  schema: ConfigSchema,
  bridge: BridgeId,
  launcherPath: string,
) {
  const args = ["--bridge", bridge];
  if (client === "workbuddy") {
    return { command: launcherPath, args, env: {} };
  }
  if (schema === "opencode-v2") {
    return { type: "local", command: [launcherPath, ...args], disabled: false };
  }
  return { type: "local", command: [launcherPath, ...args], enabled: true };
}

function getAtPath(value: unknown, segments: Array<string | number>): unknown {
  let current = value;
  for (const segment of segments) {
    if (!isRecord(current)) return undefined;
    current = current[String(segment)];
  }
  return current;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
