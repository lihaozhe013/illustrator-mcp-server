import type { BridgeId, ClientId } from "@adobe-ai-bridge/client-config";

export type ActionResult = {
  ok: boolean;
  code: string;
  message: string;
  recovery: string;
  lastVerifiedLayer: string;
  timestamp: string;
};

export type ClientConfigDocument = {
  client: ClientId;
  path: string;
  text: string;
  sha256: string | null;
  exists: boolean;
};

export type DetectedClients = Record<ClientId, boolean>;

export type InstallReport = {
  installedBridges: BridgeId[];
  runtimeResult: ActionResult;
  proxyResult: ActionResult | null;
};

export type InstallNotice = {
  message: string;
  recovery: string;
  severity: "success" | "warning" | "error";
};
