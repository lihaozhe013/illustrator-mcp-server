import type {
  BridgeId,
  ClientId,
  ConfigPreview,
} from "@adobe-ai-bridge/client-config";
import {
  createConfigPreview,
  createConfigRemovalPreview,
} from "@adobe-ai-bridge/client-config";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type {
  ActionResult,
  BridgeInstallResult,
  BridgeStatus,
  CheckState,
  ClientConfigDocument,
  ClientStatus,
  Dashboard,
  LayerStatus,
} from "./types";

const stateLabels: Record<CheckState, string> = {
  not_installed: "Not detected",
  installed_not_running: "Ready to configure",
  waiting_for_plugin: "Waiting for plugin",
  connected: "Connected",
  degraded: "Needs verification",
  error: "Error",
};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function previewDashboard(): Dashboard {
  const status: LayerStatus = {
    state: "degraded",
    label: "Browser preview",
    detail:
      "Run the desktop application to inspect local software and connections.",
    lastVerified: null,
  };
  return {
    appVersion: "0.1.0",
    architecture: "Preview",
    installation: status,
    bridges: ["illustrator", "indesign"].map((id) => ({
      id: id as BridgeId,
      name: id === "illustrator" ? "Adobe Illustrator" : "Adobe InDesign",
      application: status,
      runtime: status,
      service: status,
      extension: status,
      mcp: status,
      version: null,
    })),
    clients: [
      {
        id: "opencode",
        name: "OpenCode",
        state: "degraded",
        detail: status.detail,
        configPath: null,
        schema: null,
        lastVerified: null,
      },
      {
        id: "workbuddy",
        name: "Tencent WorkBuddy",
        state: "degraded",
        detail: status.detail,
        configPath: null,
        schema: null,
        lastVerified: null,
      },
    ],
    lastChecked: new Date().toISOString(),
  };
}

function LayerCard({ title, status }: { title: string; status: LayerStatus }) {
  const timestamp = status.lastVerified
    ? new Date(status.lastVerified).toLocaleTimeString()
    : "Not verified";
  return (
    <article className={`layer-card state-${status.state}`}>
      <div className="layer-title-row">
        <h3>{title}</h3>
        <span className="state-label">{stateLabels[status.state]}</span>
      </div>
      <p>{status.detail}</p>
      <span className="verification-time">Last verified · {timestamp}</span>
    </article>
  );
}

function BridgeCard({
  bridge,
  busy,
  onInstall,
  onOpenPlugin,
  onProxyAction,
  onRuntimeAction,
}: {
  bridge: BridgeStatus;
  busy: string | null;
  onInstall: (bridge: BridgeId) => void;
  onOpenPlugin: () => void;
  onProxyAction: (action: "start" | "stop" | "copy-token") => void;
  onRuntimeAction: (action: "rollback" | "uninstall", bridge: BridgeId) => void;
}) {
  const runtimeInstalled = bridge.runtime.state !== "not_installed";
  return (
    <section className="bridge-panel" aria-labelledby={`${bridge.id}-heading`}>
      <div className="bridge-panel-heading">
        <div>
          <div className="eyebrow">
            {bridge.id === "illustrator" ? "VECTOR DESIGN" : "PAGE LAYOUT"}
          </div>
          <h2 id={`${bridge.id}-heading`}>{bridge.name}</h2>
          <p className="bridge-version">
            {bridge.version
              ? `Runtime ${bridge.version}`
              : "Runtime not installed"}
          </p>
        </div>
        <div className="bridge-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={busy !== null}
            onClick={() => onInstall(bridge.id)}
          >
            {busy === `install-${bridge.id}`
              ? "Installing…"
              : runtimeInstalled
                ? "Update runtime"
                : "Install runtime"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy !== null || !runtimeInstalled}
            onClick={() => onRuntimeAction("rollback", bridge.id)}
          >
            {busy === `runtime-rollback-${bridge.id}`
              ? "Rolling back…"
              : "Rollback runtime"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy !== null || !runtimeInstalled}
            onClick={() => onRuntimeAction("uninstall", bridge.id)}
          >
            {busy === `runtime-uninstall-${bridge.id}`
              ? "Uninstalling…"
              : "Uninstall runtime"}
          </button>
          {bridge.id === "indesign" ? (
            <>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy !== null || !runtimeInstalled}
                onClick={() => onProxyAction("start")}
              >
                {busy === "proxy-start" ? "Starting…" : "Start proxy"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy !== null || !runtimeInstalled}
                onClick={() => onProxyAction("stop")}
              >
                {busy === "proxy-stop" ? "Stopping…" : "Stop proxy"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy !== null || !runtimeInstalled}
                onClick={() => onProxyAction("copy-token")}
              >
                Copy UXP token
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy !== null || !runtimeInstalled}
                onClick={onOpenPlugin}
              >
                Open UXP installer
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="connection-grid bridge-grid">
        <LayerCard title="Adobe application" status={bridge.application} />
        <LayerCard title="Managed runtime" status={bridge.runtime} />
        <LayerCard
          title={bridge.id === "indesign" ? "Loopback proxy" : "Client process"}
          status={bridge.service}
        />
        <LayerCard
          title={
            bridge.id === "indesign" ? "UXP panel" : "Automation permission"
          }
          status={bridge.extension}
        />
        <LayerCard title="MCP read check" status={bridge.mcp} />
      </div>
    </section>
  );
}

function clientLabel(id: ClientId): string {
  return id === "opencode" ? "OpenCode" : "Tencent WorkBuddy";
}

export function App() {
  const [dashboard, setDashboard] = useState<Dashboard>(previewDashboard);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [isNative, setIsNative] = useState(isTauri);
  const [selectedClient, setSelectedClient] = useState<ClientId>("opencode");
  const [selectedBridge, setSelectedBridge] = useState<BridgeId>("illustrator");
  const [preview, setPreview] = useState<ConfigPreview | null>(null);

  const refresh = useCallback(async () => {
    setIsNative(isTauri());
    if (!isTauri()) return;
    try {
      setDashboard(await invoke<Dashboard>("get_dashboard_command"));
    } catch {
      setNotice({
        ok: false,
        code: "DASHBOARD_UNAVAILABLE",
        message: "The manager could not read local system status.",
        recovery:
          "Restart Adobe AI Bridge and reopen Diagnostics if this persists.",
        lastVerifiedLayer: "manager",
        timestamp: new Date().toISOString(),
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = async (bridge: BridgeId) => {
    setBusy(`install-${bridge}`);
    setNotice(null);
    try {
      const response = await invoke<BridgeInstallResult>(
        "install_bridge_command",
        { bridgeId: bridge },
      );
      setNotice(response.result);
      await refresh();
    } catch {
      setNotice({
        ok: false,
        code: "RUNTIME_INSTALL_FAILED",
        message: `${bridgeLabel(bridge)} runtime installation failed.`,
        recovery:
          "Review the runtime bundle and try again. Existing user files were left unchanged.",
        lastVerifiedLayer: "runtime installer",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setBusy(null);
    }
  };

  const openPlugin = async () => {
    setBusy("open-uxp");
    try {
      setNotice(await invoke<ActionResult>("open_uxp_package_command"));
    } catch {
      setNotice({
        ok: false,
        code: "UXP_OPEN_FAILED",
        message: "The UXP installer could not be opened.",
        recovery:
          "Rebuild the verified InDesign bundle, then retry from this application.",
        lastVerifiedLayer: "UXP installer",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setBusy(null);
    }
  };

  const runProxyAction = async (action: "start" | "stop" | "copy-token") => {
    const command = {
      start: "start_indesign_proxy_command",
      stop: "stop_indesign_proxy_command",
      "copy-token": "copy_indesign_plugin_token_command",
    }[action];
    setBusy(`proxy-${action}`);
    setNotice(null);
    try {
      setNotice(await invoke<ActionResult>(command));
      if (action !== "copy-token") await refresh();
    } catch {
      setNotice({
        ok: false,
        code: "INDESIGN_PROXY_ACTION_FAILED",
        message: `The InDesign proxy could not ${action === "start" ? "start" : action === "stop" ? "stop" : "copy its token"}.`,
        recovery:
          "Review the InDesign proxy status and redacted log, then retry.",
        lastVerifiedLayer: "InDesign proxy service",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setBusy(null);
    }
  };

  const runRuntimeAction = async (
    action: "rollback" | "uninstall",
    bridge: BridgeId,
  ) => {
    if (
      action === "uninstall" &&
      !window.confirm(
        `Uninstall the ${bridgeLabel(bridge)} runtime? Client configuration entries will be preserved.`,
      )
    ) {
      return;
    }
    const command =
      action === "rollback"
        ? "rollback_bridge_command"
        : "uninstall_bridge_command";
    setBusy(`runtime-${action}-${bridge}`);
    setNotice(null);
    try {
      setNotice(await invoke<ActionResult>(command, { bridgeId: bridge }));
      await refresh();
    } catch {
      setNotice({
        ok: false,
        code: "RUNTIME_ACTION_FAILED",
        message: `${bridgeLabel(bridge)} runtime ${action} failed.`,
        recovery:
          "The manager kept unrelated engine files and client settings. Review diagnostics and retry.",
        lastVerifiedLayer: "runtime lifecycle",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setBusy(null);
    }
  };

  const previewConfig = async (action: "install" | "remove" = "install") => {
    if (!isTauri()) return;
    setBusy("preview-config");
    setNotice(null);
    setPreview(null);
    try {
      const document = await invoke<ClientConfigDocument>(
        "read_client_config_command",
        { client: selectedClient },
      );
      const launcher = await invoke<string>("get_launcher_path_command");
      const createPreview =
        action === "install" ? createConfigPreview : createConfigRemovalPreview;
      const result = createPreview({
        client: selectedClient,
        bridge: selectedBridge,
        configPath: document.path,
        text: document.text,
        launcherPath: launcher,
      });
      setPreview(result);
      setNotice({
        ok: !result.conflict,
        code: result.conflict ? "CONFIG_CONFLICT" : "CONFIG_PREVIEW_READY",
        message: result.conflict
          ? "A different server already uses this bridge name."
          : result.alreadyConfigured
            ? action === "install"
              ? "This bridge entry is already present."
              : "This bridge entry is already absent."
            : action === "install"
              ? "Review the selected MCP entry before applying it."
              : "Review the selected MCP entry removal before applying it.",
        recovery: result.conflict
          ? "The existing entry differs from the manager-owned value and was preserved."
          : "No client configuration has been changed yet.",
        lastVerifiedLayer: "configuration preview",
        timestamp: new Date().toISOString(),
      });
    } catch {
      setNotice({
        ok: false,
        code: "CONFIG_PREVIEW_FAILED",
        message: "The client configuration could not be previewed.",
        recovery:
          "Check that the supported client config is readable and valid JSONC, then retry.",
        lastVerifiedLayer: "configuration preview",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setBusy(null);
    }
  };

  const applyConfig = async () => {
    if (!preview || preview.conflict || preview.alreadyConfigured) return;
    setBusy("apply-config");
    try {
      const current = await invoke<ClientConfigDocument>(
        "read_client_config_command",
        { client: selectedClient },
      );
      if (
        current.path !== preview.configPath ||
        current.text !== preview.before
      ) {
        throw new Error("Configuration changed after preview.");
      }
      const command =
        preview.action === "install"
          ? "apply_client_config_command"
          : "remove_client_config_command";
      const result = await invoke<ActionResult>(command, {
        client: selectedClient,
        bridgeId: selectedBridge,
        expectedSha256: current.sha256,
        text: preview.after,
      });
      setNotice(result);
      setPreview(null);
      await refresh();
    } catch {
      setNotice({
        ok: false,
        code: "CONFIG_APPLY_FAILED",
        message: "The client configuration was not changed.",
        recovery:
          "Preview the current file again. If it changed during review, confirm the new diff before applying.",
        lastVerifiedLayer: "configuration transaction",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a
          className="wordmark"
          href="#dashboard"
          aria-label="Adobe AI Bridge home"
        >
          <span className="wordmark-mark" aria-hidden="true">
            AB
          </span>
          <span>
            Adobe <strong>AI Bridge</strong>
          </span>
        </a>
        <span className="app-version">
          Manager {dashboard.appVersion} · {dashboard.architecture}
        </span>
      </header>

      <section className="page-heading" id="dashboard">
        <div className="eyebrow">LOCAL ADOBE CONNECTION MANAGER</div>
        <h1>Two bridges. One place to manage them.</h1>
        <p>
          Install either engine independently, connect both AI clients, and
          verify each layer before using a document tool.
        </p>
      </section>

      {notice ? (
        <aside
          className={`notice ${notice.ok ? "notice-success" : "notice-error"}`}
          role="status"
          aria-live="polite"
        >
          <div className="notice-heading">{notice.message}</div>
          <div>{notice.recovery}</div>
        </aside>
      ) : null}
      {!isNative ? (
        <aside className="notice notice-warning" role="status">
          Browser preview mode. Local app detection, installation and client
          configuration are available in the desktop app.
        </aside>
      ) : null}

      <section className="section-block">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">INDEPENDENT ENGINE STATUS</div>
            <h2>Adobe applications</h2>
          </div>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => void refresh()}
            aria-label="Refresh diagnostics"
          >
            Refresh · {new Date(dashboard.lastChecked).toLocaleTimeString()}
          </button>
        </div>
        <div className="bridge-stack">
          {dashboard.bridges.map((bridge) => (
            <BridgeCard
              key={bridge.id}
              bridge={bridge}
              busy={busy}
              onInstall={(id) => void install(id)}
              onOpenPlugin={() => void openPlugin()}
              onProxyAction={(action) => void runProxyAction(action)}
              onRuntimeAction={(action, id) =>
                void runRuntimeAction(action, id)
              }
            />
          ))}
        </div>
      </section>

      <section className="section-block clients-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">FOUR SEPARATE MCP CONNECTIONS</div>
            <h2>OpenCode and Tencent WorkBuddy</h2>
          </div>
          <p>
            Each client gets a distinct server entry for each Adobe application.
          </p>
        </div>
        <div className="connection-grid client-grid">
          {dashboard.clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
        <div className="config-controls">
          <label>
            AI client
            <select
              value={selectedClient}
              onChange={(event) => {
                setSelectedClient(event.target.value as ClientId);
                setPreview(null);
              }}
            >
              <option value="opencode">OpenCode</option>
              <option value="workbuddy">Tencent WorkBuddy</option>
            </select>
          </label>
          <label>
            Adobe bridge
            <select
              value={selectedBridge}
              onChange={(event) => {
                setSelectedBridge(event.target.value as BridgeId);
                setPreview(null);
              }}
            >
              <option value="illustrator">Illustrator MCP</option>
              <option value="indesign">InDesign MCP</option>
            </select>
          </label>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy !== null}
            onClick={() => void previewConfig()}
          >
            {busy === "preview-config"
              ? "Preparing preview…"
              : "Preview install"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy !== null}
            onClick={() => void previewConfig("remove")}
          >
            {busy === "preview-config"
              ? "Preparing preview…"
              : "Preview removal"}
          </button>
        </div>
        {preview ? (
          <article className="preview-card" aria-live="polite">
            <div className="layer-title-row">
              <h3>
                {clientLabel(preview.client)} · {preview.bridge} MCP
              </h3>
              <span className="state-label">{preview.schema}</span>
            </div>
            <p>{preview.configPath}</p>
            <p>
              {preview.conflict
                ? "Existing entry preserved because it differs from the manager-owned value."
                : preview.alreadyConfigured
                  ? preview.action === "install"
                    ? "No file changes are required."
                    : "The selected bridge entry is already absent."
                  : preview.action === "install"
                    ? "Only the selected Adobe AI Bridge entry will be added. Existing client settings remain in place."
                    : "Only the selected Adobe AI Bridge entry will be removed. The current file will be backed up first."}
            </p>
            {!preview.conflict && !preview.alreadyConfigured ? (
              <button
                type="button"
                className="button button-primary"
                disabled={busy !== null}
                onClick={() => void applyConfig()}
              >
                {busy === "apply-config"
                  ? "Applying safely…"
                  : preview.action === "install"
                    ? "Apply this entry"
                    : "Remove this entry"}
              </button>
            ) : null}
          </article>
        ) : null}
      </section>

      <footer className="footer-row">
        <span>
          Local manager · document content is not included in diagnostics
        </span>
        <span>
          Checks are dated and separated from real application verification
        </span>
      </footer>
    </main>
  );
}

function ClientCard({ client }: { client: ClientStatus }) {
  return (
    <article className={`layer-card state-${client.state}`}>
      <div className="layer-title-row">
        <h3>{client.name}</h3>
        <span className="state-label">{stateLabels[client.state]}</span>
      </div>
      <p>{client.detail}</p>
      <span className="verification-time">
        {client.schema ?? "No schema detected"}
        {client.configPath ? ` · ${client.configPath}` : ""}
      </span>
    </article>
  );
}

function bridgeLabel(bridge: BridgeId): string {
  return bridge === "illustrator" ? "Illustrator" : "InDesign";
}
