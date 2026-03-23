import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { afterEach, test } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const openProcesses = [];

afterEach(async () => {
  await Promise.all(
    openProcesses.splice(0).map(async ({ child, directory }) => {
      if (child.exitCode === null) child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

function request(client, id, method, params) {
  const value = { jsonrpc: "2.0", id, method, params };
  client.child.stdin.write(`${JSON.stringify(value)}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for MCP ${method}.`)),
      5000,
    );
    const onLine = (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        clearTimeout(timer);
        client.outputError = `Non-JSON stdout: ${line}`;
        reject(error);
        return;
      }
      if (message.id !== id) return;
      clearTimeout(timer);
      client.stdoutLines.push(line);
      resolve(message);
    };
    client.lines.once("line", onLine);
  });
}

test("upstream Illustrator server completes stdio handshake, lists tools, and returns a mocked read failure cleanly", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "adobe-ai-bridge-illustrator-"),
  );
  const fakeBin = path.join(directory, "bin");
  await mkdir(fakeBin);
  const fakeOsascript = path.join(fakeBin, "osascript");
  await writeFile(
    fakeOsascript,
    "#!/bin/sh\nprintf '%s\\n' 'Connection is invalid' >&2\nexit 1\n",
  );
  await chmod(fakeOsascript, 0o700);

  const child = spawn(
    process.execPath,
    [path.join(projectRoot, "illustrator-mcp/dist/bundle.cjs")],
    {
      cwd: path.join(projectRoot, "illustrator-mcp"),
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const lines = createInterface({ input: child.stdout });
  const client = {
    child,
    lines,
    stdoutLines: [],
    stderr: "",
    outputError: null,
  };
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    client.stderr += chunk;
  });
  lines.on("line", (line) => {
    try {
      JSON.parse(line);
    } catch {
      client.outputError = `Non-JSON stdout: ${line}`;
    }
  });
  openProcesses.push({ child, directory });

  const initialized = await request(client, 1, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "adobe-ai-bridge-test", version: "0.1.0" },
  });
  assert.equal(initialized.error, undefined);
  assert.equal(initialized.result.serverInfo.name, "illustrator-mcp-server");
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');

  const listed = await request(client, 2, "tools/list", {});
  assert.equal(listed.error, undefined);
  const names = new Set(listed.result.tools.map((tool) => tool.name));
  assert.ok(names.has("get_document_info"));
  assert.ok(names.size >= 60);

  const read = await request(client, 3, "tools/call", {
    name: "get_document_info",
    arguments: {},
  });
  assert.equal(read.error, undefined);
  assert.equal(read.result.isError, true);
  assert.match(JSON.stringify(read.result), /Illustrator is not running/);
  assert.equal(client.outputError, null);
  assert.ok(
    client.stdoutLines.every((line) => JSON.parse(line).jsonrpc === "2.0"),
  );
});
