import type { ClientId } from "@adobe-ai-bridge/client-config";
import { describe, expect, it, vi } from "vitest";
import { strings } from "./i18n";
import {
  completeInstallation,
  configureClients,
  type InvokeCommand,
} from "./installer";
import type { ActionResult, ClientConfigDocument } from "./types";

const success: ActionResult = {
  ok: true,
  code: "CONFIG_APPLIED",
  message: "Configured.",
  recovery: "Restart the client.",
  lastVerifiedLayer: "client configuration",
  timestamp: "2026-10-08T00:00:00Z",
};

function documentFor(client: ClientId, text = "{}"): ClientConfigDocument {
  return {
    client,
    path: `/tmp/${client}.json`,
    text,
    sha256: null,
    exists: false,
  };
}

describe("client installation coordination", () => {
  it("configures only selected clients for successfully installed bridges", async () => {
    const invoke = vi.fn(
      async <T>(command: string, args?: Record<string, unknown>) => {
        if (command === "get_launcher_path_command") {
          return "/bridge/launcher" as T;
        }
        if (command === "read_client_config_command") {
          return documentFor(args?.client as ClientId) as T;
        }
        return success as T;
      },
    );

    const result = await configureClients({
      clients: ["workbuddy"],
      bridges: ["illustrator", "indesign"],
      locale: "en",
      copy: strings.en,
      invoke: invoke as unknown as InvokeCommand,
    });

    expect(result.issues).toEqual([]);
    expect(result.configured).toHaveLength(2);
    expect(
      invoke.mock.calls
        .filter(([command]) => command === "read_client_config_command")
        .map(([, args]) => args?.client),
    ).toEqual(["workbuddy", "workbuddy"]);
  });

  it("continues configuring WorkBuddy when OpenCode configuration is invalid", async () => {
    const invoke = vi.fn(
      async <T>(command: string, args?: Record<string, unknown>) => {
        if (command === "get_launcher_path_command") {
          return "/bridge/launcher" as T;
        }
        if (command === "read_client_config_command") {
          const client = args?.client as ClientId;
          return documentFor(
            client,
            client === "opencode" ? "{ invalid" : "{}",
          ) as T;
        }
        return success as T;
      },
    );

    const result = await configureClients({
      clients: ["opencode", "workbuddy"],
      bridges: ["illustrator", "indesign"],
      locale: "en",
      copy: strings.en,
      invoke: invoke as unknown as InvokeCommand,
    });

    expect(result.configured).toHaveLength(2);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((issue) => issue.includes("OpenCode"))).toBe(
      true,
    );
    expect(
      invoke.mock.calls
        .filter(([command]) => command === "apply_client_config_command")
        .map(([, args]) => args?.client),
    ).toEqual(["workbuddy", "workbuddy"]);
  });

  it("keeps client configuration successful when the proxy health check fails", async () => {
    const invoke = vi.fn(
      async <T>(command: string, args?: Record<string, unknown>) => {
        if (command === "get_launcher_path_command") {
          return "/bridge/launcher" as T;
        }
        if (command === "read_client_config_command") {
          return documentFor(args?.client as ClientId) as T;
        }
        return success as T;
      },
    );
    const result = await completeInstallation({
      report: {
        installedBridges: ["illustrator", "indesign"],
        runtimeResult: success,
        proxyResult: {
          ...success,
          ok: false,
          code: "INDESIGN_PROXY_NOT_HEALTHY",
          message: "Proxy health check timed out.",
        },
      },
      clients: ["workbuddy"],
      locale: "en",
      copy: strings.en,
      invoke: invoke as unknown as InvokeCommand,
    });

    expect(result.severity).toBe("warning");
    expect(result.message).toContain("WorkBuddy (Illustrator)");
    expect(result.message).toContain("WorkBuddy (InDesign)");
    expect(result.message).toContain("Proxy health check timed out.");
    expect(
      invoke.mock.calls
        .filter(([command]) => command === "apply_client_config_command")
        .map(([, args]) => args?.client),
    ).toEqual(["workbuddy", "workbuddy"]);
  });

  it("configures only bridges reported as installed after a partial runtime failure", async () => {
    const invoke = vi.fn(
      async <T>(command: string, args?: Record<string, unknown>) => {
        if (command === "get_launcher_path_command") {
          return "/bridge/launcher" as T;
        }
        if (command === "read_client_config_command") {
          return documentFor(args?.client as ClientId) as T;
        }
        return success as T;
      },
    );
    const result = await completeInstallation({
      report: {
        installedBridges: ["illustrator"],
        runtimeResult: {
          ...success,
          ok: false,
          code: "BRIDGE_INSTALL_INCOMPLETE",
          message: "InDesign runtime failed checksum validation.",
        },
        proxyResult: success,
      },
      clients: ["workbuddy"],
      locale: "en",
      copy: strings.en,
      invoke: invoke as unknown as InvokeCommand,
    });

    expect(result.severity).toBe("error");
    expect(result.message).toContain(
      "InDesign runtime failed checksum validation.",
    );
    expect(result.message).toContain("WorkBuddy (Illustrator)");
    expect(result.message).not.toContain("WorkBuddy (InDesign)");
  });
});
