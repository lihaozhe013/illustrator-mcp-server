import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";

process.env.INDESIGN_BRIDGE_PROXY_TIMEOUT_MS = "180";
const { createBridgeProxy } = await import("../../runtime/proxy/server.mjs");
const upstreamRequire = createRequire(
  path.resolve("runtime/proxy/package.json"),
);
const ioClient = upstreamRequire("socket.io-client").io;
const opened = [];

async function startProxy(handler) {
  const stateDir = await mkdtemp(
    path.join(tmpdir(), "indesign-bridge-proxy-test-"),
  );
  await mkdir(path.join(stateDir, "state"), { mode: 0o700 });
  const token = randomBytes(48).toString("hex");
  const proxy = createBridgeProxy({
    token,
    stateDir: path.join(stateDir, "state"),
    port: 0,
  });
  await new Promise((resolve, reject) => {
    proxy.server.once("error", reject);
    proxy.server.listen(0, "127.0.0.1", resolve);
  });
  const address = proxy.server.address();
  const clientUrl = `http://127.0.0.1:${address.port}`;
  opened.push({ proxy, stateDir });
  const plugin = ioClient(clientUrl, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    plugin.once("connect", resolve);
    plugin.once("connect_error", reject);
  });
  if (handler) {
    plugin.on("command_packet", (packet) => handler(packet, plugin));
    plugin.emit("register", { application: "indesign" });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const client = ioClient(clientUrl, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return {
    stateDir: path.join(stateDir, "state"),
    client,
    plugin,
    clientUrl,
    token,
  };
}

async function emitCommand(clientUrl, token, command) {
  const client = ioClient(clientUrl, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  try {
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1000);
      client.once("packet_response", (packet) => {
        clearTimeout(timeout);
        resolve(packet);
      });
      client.emit("command_packet", {
        application: "indesign",
        command: { action: command },
      });
    });
  } finally {
    client.close();
  }
}

afterEach(async () => {
  await Promise.all(
    opened.splice(0).map(async ({ proxy, stateDir }) => {
      if (proxy.server.listening) await proxy.close();
      await rm(stateDir, { recursive: true, force: true });
    }),
  );
});

test("binds exclusively to loopback and rejects unauthorized clients", async () => {
  const { clientUrl } = await startProxy();
  assert.equal(new URL(clientUrl).hostname, "127.0.0.1");
  const untrusted = ioClient(clientUrl, {
    auth: { token: "wrong-token" },
    transports: ["websocket"],
    reconnection: false,
  });
  const error = await new Promise((resolve) =>
    untrusted.once("connect_error", resolve),
  );
  assert.match(error.message, /invalid/i);
  untrusted.close();
});

test("reports plugin health without exposing session credentials or document data", async () => {
  const { clientUrl, token, plugin } = await startProxy(async () => undefined);
  const response = await fetch(`${clientUrl}/bridge/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    bridge: "indesign",
    pluginConnected: true,
  });
  assert.equal(
    JSON.stringify(
      await (await fetch(`${clientUrl}/bridge/health`)).json(),
    ).includes(token),
    false,
  );
  plugin.close();
});

test("rejects additional UXP panels and serializes protocol-compatible MCP operations", async () => {
  let active = 0;
  let maximumActive = 0;
  let sequence = 0;
  const { clientUrl, token } = await startProxy(async (message, socket) => {
    active += 1;
    maximumActive = Math.max(active, maximumActive);
    sequence += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    socket.emit("command_packet_response", {
      packet: {
        senderId: message.senderId,
        requestId: message.requestId,
        status: "SUCCESS",
        response: { sequence },
      },
    });
    active -= 1;
  });
  const parallel = await Promise.all([
    emitCommand(clientUrl, token, "getActiveDocumentSettings"),
    emitCommand(clientUrl, token, "getActiveDocumentSettings"),
    emitCommand(clientUrl, token, "getActiveDocumentSettings"),
  ]);
  assert.deepEqual(
    parallel.map((value) => value.response.sequence),
    [1, 2, 3],
  );
  assert.equal(maximumActive, 1);
});

test("reports an unknown timeout and accepts the next operation", async () => {
  let commandCount = 0;
  const { stateDir, clientUrl, token } = await startProxy(
    async (message, socket) => {
      commandCount += 1;
      if (commandCount === 1) return;
      socket.emit("command_packet_response", {
        packet: {
          senderId: message.senderId,
          requestId: message.requestId,
          status: "SUCCESS",
          response: { completed: true },
        },
      });
    },
  );
  const result = await emitCommand(clientUrl, token, "executeJsx");
  assert.equal(result.outcomeUnknown, true);
  assert.match(result.message, /outcome is unknown/i);
  const second = await emitCommand(clientUrl, token, "populateTemplate");
  assert.deepEqual(second.response, { completed: true });
  assert.equal(commandCount, 2);
  const markerExists = await access(
    path.join(stateDir, "indesign-operation-pending.json"),
  ).then(
    () => true,
    () => false,
  );
  assert.equal(markerExists, false);
});

test("starts without consulting stale operation state", async () => {
  const stateDir = await mkdtemp(
    path.join(tmpdir(), "indesign-bridge-stale-test-"),
  );
  const token = randomBytes(48).toString("hex");
  const recovered = createBridgeProxy({ token, stateDir, port: 0 });
  await new Promise((resolve) =>
    recovered.server.listen(0, "127.0.0.1", resolve),
  );
  opened.push({ proxy: recovered, stateDir });
  const client = ioClient(
    `http://127.0.0.1:${recovered.server.address().port}`,
    { auth: { token }, transports: ["websocket"], reconnection: false },
  );
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  const result = await emitCommand(
    `http://127.0.0.1:${recovered.server.address().port}`,
    token,
    "populateTemplate",
  );
  assert.equal(result.status, "FAILURE");
  assert.match(result.message, /plugin is not connected/i);
  client.close();
});
