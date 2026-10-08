import type { ClientId } from "@adobe-ai-bridge/client-config";

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
