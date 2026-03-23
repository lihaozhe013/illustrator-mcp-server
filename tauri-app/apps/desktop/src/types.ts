export type BridgeId = "illustrator" | "indesign";
export type ClientId = "opencode" | "workbuddy";
export type CheckState =
  | "not_installed"
  | "installed_not_running"
  | "waiting_for_plugin"
  | "connected"
  | "degraded"
  | "error";

export type LayerStatus = {
  state: CheckState;
  label: string;
  detail: string;
  lastVerified: string | null;
};

export type BridgeStatus = {
  id: BridgeId;
  name: string;
  application: LayerStatus;
  runtime: LayerStatus;
  service: LayerStatus;
  extension: LayerStatus;
  mcp: LayerStatus;
  version: string | null;
};

export type ClientStatus = {
  id: ClientId;
  name: string;
  state: CheckState;
  detail: string;
  configPath: string | null;
  schema: string | null;
  lastVerified: string | null;
};

export type Dashboard = {
  appVersion: string;
  architecture: string;
  installation: LayerStatus;
  bridges: BridgeStatus[];
  clients: ClientStatus[];
  lastChecked: string;
};

export type ActionResult = {
  ok: boolean;
  code: string;
  message: string;
  recovery: string;
  lastVerifiedLayer: string;
  timestamp: string;
};

export type BridgeInstallResult = {
  result: ActionResult;
  installedPath: string | null;
};

export type ClientConfigDocument = {
  client: ClientId;
  path: string;
  text: string;
  sha256: string | null;
  exists: boolean;
};
