import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const upstreamRequire = createRequire(path.join(here, "package.json"));
const upstreamExpress = upstreamRequire("express");
const upstreamSocketIo = upstreamRequire("socket.io");

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.INDESIGN_BRIDGE_PROXY_PORT ?? "3001", 10);
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
const MAX_OPERATION_WAIT_MS = Number.parseInt(process.env.INDESIGN_BRIDGE_PROXY_TIMEOUT_MS ?? "300000", 10);

function readSessionToken() {
  const tokenPath = process.env.INDESIGN_BRIDGE_TOKEN_FILE;
  if (!tokenPath) throw new Error("INDESIGN_BRIDGE_TOKEN_FILE must identify the protected session token file.");
  if ((fs.statSync(tokenPath).mode & 0o077) !== 0) throw new Error("The bridge session token file must not be accessible by other users.");
  const token = fs.readFileSync(tokenPath, "utf8").trim();
  if (token.length < 32) throw new Error("The bridge session token must contain at least 32 characters.");
  return token;
}

function matchesSessionToken(value, expected) {
  if (typeof value !== "string") return false;
  const supplied = Buffer.from(value, "utf8");
  const required = Buffer.from(expected, "utf8");
  return supplied.length === required.length && crypto.timingSafeEqual(supplied, required);
}

export function createBridgeProxy(options = {}) {
  const token = options.token ?? readSessionToken();
  const port = options.port ?? PORT;
  const stateDir = options.stateDir ?? process.env.INDESIGN_BRIDGE_STATE_DIR;
  if (!stateDir) throw new Error("INDESIGN_BRIDGE_STATE_DIR must identify the private proxy state directory.");
  const pendingPath = path.join(stateDir, "indesign-operation-pending.json");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  if ((fs.statSync(stateDir).mode & 0o077) !== 0) throw new Error("The bridge state directory must not be accessible by other users.");

  const app = upstreamExpress();
  app.get("/bridge/health", (_request, response) => {
    response.json({
      bridge: "indesign",
      pluginConnected: activePluginId !== null,
      outcomeUnknown: poisoned,
    });
  });
  const server = http.createServer(app);
  const io = new upstreamSocketIo.Server(server, {
    transports: ["websocket"],
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    serveClient: false,
    perMessageDeflate: false,
  });

  let activePluginId = null;
  let queuedOperations = Promise.resolve();
  let poisoned = fs.existsSync(pendingPath);
  const pending = new Map();

  io.use((socket, next) => {
    if (matchesSessionToken(socket.handshake.auth?.token, token)) {
      next();
      return;
    }
    next(new Error("The bridge session token is invalid."));
  });

  function poisonPendingOperations(reason) {
    poisoned = true;
    for (const operation of pending.values()) {
      clearTimeout(operation.timer);
      operation.resolve({
        status: "FAILURE",
        message: reason,
        outcomeUnknown: true,
      });
    }
    pending.clear();
  }

  io.on("connection", (socket) => {
    socket.on("register", (registration) => {
      if (registration?.application !== "indesign") {
        socket.emit("registration_response", {
          type: "registration",
          status: "failure",
          message: "Only the InDesign UXP panel may register with this bridge.",
        });
        return;
      }
      if (activePluginId !== null && activePluginId !== socket.id) {
        socket.emit("registration_response", {
          type: "registration",
          status: "failure",
          message: "An InDesign plugin is already connected.",
        });
        return;
      }
      activePluginId = socket.id;
      socket.data.isIndesignPlugin = true;
      socket.emit("registration_response", {
        type: "registration",
        status: "success",
        message: "Registered for indesign",
      });
    });

    socket.on("command_packet_response", ({ packet } = {}) => {
      if (!socket.data.isIndesignPlugin || socket.id !== activePluginId) return;
      if (!packet || typeof packet.senderId !== "string") return;
      const operation = pending.get(packet.senderId);
      if (!operation) return;
      if (packet.requestId !== operation.requestId) return;

      clearTimeout(operation.timer);
      pending.delete(packet.senderId);
      try {
        fs.unlinkSync(pendingPath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          poisoned = true;
          operation.resolve({ status: "FAILURE", message: "Could not clear the pending-operation recovery marker.", outcomeUnknown: true });
          return;
        }
      }
      operation.resolve(packet);
    });

    socket.on("command_packet", (message) => {
      if (socket.data.isIndesignPlugin || !message || message.application !== "indesign" || !message.command || typeof message.command.action !== "string") {
        socket.emit("packet_response", { status: "FAILURE", message: "The InDesign MCP command packet is invalid." });
        return;
      }

      const operation = queuedOperations.then(async () => {
        if (poisoned || fs.existsSync(pendingPath)) {
          poisoned = true;
          return { status: "FAILURE", message: "A previous document operation has an unknown outcome. Reopen and inspect the document before restarting the bridge.", outcomeUnknown: true };
        }
        if (activePluginId === null) {
          return { status: "FAILURE", message: "The authenticated InDesign plugin is not connected." };
        }

        const plugin = io.sockets.sockets.get(activePluginId);
        if (!plugin?.connected || !plugin.data.isIndesignPlugin) {
          activePluginId = null;
          return { status: "FAILURE", message: "The authenticated InDesign plugin is not connected." };
        }

        const requestId = crypto.randomUUID();
        const marker = {
          requestId,
          action: message.command.action,
          startedAt: new Date().toISOString(),
        };
        const markerFd = fs.openSync(pendingPath, "wx", 0o600);
        try {
          fs.writeFileSync(markerFd, JSON.stringify(marker), "utf8");
          fs.fsyncSync(markerFd);
        } finally {
          fs.closeSync(markerFd);
        }

        const response = await new Promise((resolve) => {
          const timer = setTimeout(() => {
            pending.delete(socket.id);
            poisoned = true;
            resolve({
              status: "FAILURE",
              message: "The document operation timed out. Its outcome is unknown; inspect the document in InDesign before requesting another change.",
              outcomeUnknown: true,
            });
          }, MAX_OPERATION_WAIT_MS);
          pending.set(socket.id, { requestId, timer, resolve });
          plugin.emit("command_packet", {
            senderId: socket.id,
            requestId,
            application: "indesign",
            command: message.command,
          });
        });

        return response;
      }).catch(() => ({ status: "FAILURE", message: "The InDesign proxy operation failed. Check bridge diagnostics." }));

      queuedOperations = operation.then(() => undefined, () => undefined);
      void operation.then((response) => {
        if (socket.connected) socket.emit("packet_response", response);
      });
    });

    socket.on("disconnect", () => {
      if (!socket.data.isIndesignPlugin || activePluginId !== socket.id) return;
      activePluginId = null;
      if (pending.size > 0) poisonPendingOperations("The InDesign plugin disconnected while a document operation was running.");
    });
  });

  return {
    io,
    server,
    address: HOST,
    port,
    close: () => new Promise((resolve, reject) => io.close((error) => error ? reject(error) : resolve())),
  };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const proxy = createBridgeProxy();
  proxy.server.listen(proxy.port, proxy.address, () => {
    process.stderr.write(`InDesign proxy listening on ws://${proxy.address}:${proxy.port}\n`);
  });
  proxy.server.on("error", () => {
    process.stderr.write("The InDesign proxy failed to bind its loopback port. Check port 3001 and bridge diagnostics.\n");
    process.exitCode = 1;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => proxy.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; }));
  }
}
