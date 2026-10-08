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
import {
  detectSystemLocale,
  formatTemplate,
  localizeActionResult,
  localizeLayerDetail,
  localizedClientDetail,
  readLanguagePreference,
  saveLanguagePreference,
  strings,
} from "./i18n";
import type { LanguagePreference, Locale, UiStrings } from "./i18n";
import type {
  ActionResult,
  BridgeInstallResult,
  BridgeStatus,
  ClientConfigDocument,
  ClientStatus,
  Dashboard,
  LayerStatus,
} from "./types";

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

function LayerCard({
  title,
  status,
  locale,
  copy,
  bridge,
}: {
  title: string;
  status: LayerStatus;
  locale: Locale;
  copy: UiStrings;
  bridge?: BridgeId;
}) {
  const timestamp = status.lastVerified
    ? new Date(status.lastVerified).toLocaleTimeString(locale)
    : copy.notVerified;
  return (
    <article className={`layer-card state-${status.state}`}>
      <div className="layer-title-row">
        <h3>{title}</h3>
        <span className="state-label">{copy.stateLabels[status.state]}</span>
      </div>
      <p>{localizeLayerDetail(status.detail, locale, bridge)}</p>
      <span className="verification-time">
        {copy.lastVerified} · {timestamp}
      </span>
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
  locale,
  copy,
}: {
  bridge: BridgeStatus;
  busy: string | null;
  onInstall: (bridge: BridgeId) => void;
  onOpenPlugin: () => void;
  onProxyAction: (action: "start" | "stop" | "copy-token") => void;
  onRuntimeAction: (action: "rollback" | "uninstall", bridge: BridgeId) => void;
  locale: Locale;
  copy: UiStrings;
}) {
  const runtimeInstalled = bridge.runtime.state !== "not_installed";
  return (
    <section className="bridge-panel" aria-labelledby={`${bridge.id}-heading`}>
      <div className="bridge-panel-heading">
        <div>
          <div className="eyebrow">
            {bridge.id === "illustrator" ? copy.vectorDesign : copy.pageLayout}
          </div>
          <h2 id={`${bridge.id}-heading`}>{bridge.name}</h2>
          <p className="bridge-version">
            {bridge.version
              ? `${copy.runtime} ${bridge.version}`
              : copy.runtimeNotInstalled}
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
              ? copy.installing
              : runtimeInstalled
                ? copy.updateRuntime
                : copy.installRuntime}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy !== null || !runtimeInstalled}
            onClick={() => onRuntimeAction("rollback", bridge.id)}
          >
            {busy === `runtime-rollback-${bridge.id}`
              ? copy.rollingBack
              : copy.rollbackRuntime}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy !== null || !runtimeInstalled}
            onClick={() => onRuntimeAction("uninstall", bridge.id)}
          >
            {busy === `runtime-uninstall-${bridge.id}`
              ? copy.uninstalling
              : copy.uninstallRuntime}
          </button>
          {bridge.id === "indesign" ? (
            <>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy !== null || !runtimeInstalled}
                onClick={() => onProxyAction("start")}
              >
                {busy === "proxy-start" ? copy.starting : copy.startProxy}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy !== null || !runtimeInstalled}
                onClick={() => onProxyAction("stop")}
              >
                {busy === "proxy-stop" ? copy.stopping : copy.stopProxy}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy !== null || !runtimeInstalled}
                onClick={() => onProxyAction("copy-token")}
              >
                {copy.copyUxpToken}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy !== null || !runtimeInstalled}
                onClick={onOpenPlugin}
              >
                {copy.openUxpInstaller}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="connection-grid bridge-grid">
        <LayerCard
          title={copy.adobeApplication}
          status={bridge.application}
          locale={locale}
          copy={copy}
          bridge={bridge.id}
        />
        <LayerCard
          title={copy.managedRuntime}
          status={bridge.runtime}
          locale={locale}
          copy={copy}
          bridge={bridge.id}
        />
        <LayerCard
          title={
            bridge.id === "indesign" ? copy.loopbackProxy : copy.clientProcess
          }
          status={bridge.service}
          locale={locale}
          copy={copy}
          bridge={bridge.id}
        />
        <LayerCard
          title={
            bridge.id === "indesign" ? copy.uxpPanel : copy.automationPermission
          }
          status={bridge.extension}
          locale={locale}
          copy={copy}
          bridge={bridge.id}
        />
        <LayerCard
          title={copy.mcpReadCheck}
          status={bridge.mcp}
          locale={locale}
          copy={copy}
          bridge={bridge.id}
        />
      </div>
    </section>
  );
}

function clientLabel(id: ClientId, locale: Locale): string {
  if (id === "opencode") return "OpenCode";
  return locale === "zh-CN" ? "腾讯 WorkBuddy" : "Tencent WorkBuddy";
}

export function App() {
  const [dashboard, setDashboard] = useState<Dashboard>(previewDashboard);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [isNative, setIsNative] = useState(isTauri);
  const [languagePreference, setLanguagePreference] =
    useState<LanguagePreference>(readLanguagePreference);
  const [systemLocale, setSystemLocale] = useState<Locale>(detectSystemLocale);
  const locale =
    languagePreference === "system" ? systemLocale : languagePreference;
  const copy = strings[locale];
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

  useEffect(() => {
    const updateSystemLocale = () => setSystemLocale(detectSystemLocale());
    document.documentElement.lang = locale;
    window.addEventListener("languagechange", updateSystemLocale);
    return () =>
      window.removeEventListener("languagechange", updateSystemLocale);
  }, [locale]);

  useEffect(() => {
    saveLanguagePreference(languagePreference);
  }, [languagePreference]);

  const displayNotice = notice
    ? localizeActionResult(notice, locale, copy)
    : null;

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
        formatTemplate(copy.uninstallConfirm, {
          bridge: bridgeLabel(bridge),
        }),
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
        code: result.conflict
          ? "CONFIG_CONFLICT"
          : result.alreadyConfigured
            ? action === "install"
              ? "CONFIG_ENTRY_ALREADY_PRESENT"
              : "CONFIG_ENTRY_ALREADY_ABSENT"
            : action === "install"
              ? "CONFIG_PREVIEW_INSTALL_READY"
              : "CONFIG_PREVIEW_REMOVE_READY",
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
        <a className="wordmark" href="#dashboard" aria-label={copy.homeLabel}>
          <span className="wordmark-mark" aria-hidden="true">
            AB
          </span>
          <span>
            Adobe <strong>AI Bridge</strong>
          </span>
        </a>
        <div className="topbar-meta">
          <span className="app-version">
            {copy.manager} {dashboard.appVersion} · {dashboard.architecture}
          </span>
          <label className="language-control">
            <span>{copy.language}</span>
            <select
              aria-label={copy.language}
              value={languagePreference}
              onChange={(event) =>
                setLanguagePreference(event.target.value as LanguagePreference)
              }
            >
              <option value="system">
                {copy.followSystem} (
                {systemLocale === "zh-CN"
                  ? copy.simplifiedChinese
                  : copy.english}
                )
              </option>
              <option value="en">{copy.english}</option>
              <option value="zh-CN">{copy.simplifiedChinese}</option>
            </select>
          </label>
        </div>
      </header>

      <section className="page-heading" id="dashboard">
        <div className="eyebrow">{copy.localAdobeManager}</div>
        <h1>{copy.pageTitle}</h1>
        <p>{copy.pageIntro}</p>
      </section>

      {displayNotice ? (
        <aside
          className={`notice ${
            displayNotice.ok ? "notice-success" : "notice-error"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="notice-heading">{displayNotice.message}</div>
          <div>{displayNotice.recovery}</div>
        </aside>
      ) : null}
      {!isNative ? (
        <aside className="notice notice-warning" role="status">
          {copy.previewOnly}
        </aside>
      ) : null}

      <section className="section-block">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">{copy.independentEngineStatus}</div>
            <h2>{copy.adobeApplications}</h2>
          </div>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => void refresh()}
            aria-label={copy.refreshDiagnostics}
          >
            {copy.refresh} ·{" "}
            {new Date(dashboard.lastChecked).toLocaleTimeString(locale)}
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
              locale={locale}
              copy={copy}
            />
          ))}
        </div>
      </section>

      <section className="section-block clients-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">{copy.fourConnections}</div>
            <h2>{copy.clientHeading}</h2>
          </div>
          <p>{copy.clientIntro}</p>
        </div>
        <div className="connection-grid client-grid">
          {dashboard.clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              locale={locale}
              copy={copy}
            />
          ))}
        </div>
        <div className="config-controls">
          <label>
            {copy.aiClient}
            <select
              value={selectedClient}
              onChange={(event) => {
                setSelectedClient(event.target.value as ClientId);
                setPreview(null);
              }}
            >
              <option value="opencode">OpenCode</option>
              <option value="workbuddy">
                {locale === "zh-CN" ? "腾讯 WorkBuddy" : "Tencent WorkBuddy"}
              </option>
            </select>
          </label>
          <label>
            {copy.adobeBridge}
            <select
              value={selectedBridge}
              onChange={(event) => {
                setSelectedBridge(event.target.value as BridgeId);
                setPreview(null);
              }}
            >
              <option value="illustrator">{copy.illustratorMcp}</option>
              <option value="indesign">{copy.indesignMcp}</option>
            </select>
          </label>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy !== null}
            onClick={() => void previewConfig()}
          >
            {busy === "preview-config"
              ? copy.preparingPreview
              : copy.previewInstall}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy !== null}
            onClick={() => void previewConfig("remove")}
          >
            {busy === "preview-config"
              ? copy.preparingPreview
              : copy.previewRemoval}
          </button>
        </div>
        {preview ? (
          <article className="preview-card" aria-live="polite">
            <div className="layer-title-row">
              <h3>
                {clientLabel(preview.client, locale)} ·{" "}
                {bridgeLabel(preview.bridge)} MCP
              </h3>
              <span className="state-label">{preview.schema}</span>
            </div>
            <p>{preview.configPath}</p>
            <p>
              {preview.conflict
                ? copy.existingEntryPreserved
                : preview.alreadyConfigured
                  ? preview.action === "install"
                    ? copy.noFileChanges
                    : copy.selectedEntryAbsent
                  : preview.action === "install"
                    ? copy.entryWillBeAdded
                    : copy.entryWillBeRemoved}
            </p>
            {!preview.conflict && !preview.alreadyConfigured ? (
              <button
                type="button"
                className="button button-primary"
                disabled={busy !== null}
                onClick={() => void applyConfig()}
              >
                {busy === "apply-config"
                  ? copy.applyingSafely
                  : preview.action === "install"
                    ? copy.applyEntry
                    : copy.removeEntry}
              </button>
            ) : null}
          </article>
        ) : null}
      </section>

      <footer className="footer-row">
        <span>{copy.localManagerFooter}</span>
        <span>{copy.verificationFooter}</span>
      </footer>
    </main>
  );
}

function ClientCard({
  client,
  locale,
  copy,
}: {
  client: ClientStatus;
  locale: Locale;
  copy: UiStrings;
}) {
  return (
    <article className={`layer-card state-${client.state}`}>
      <div className="layer-title-row">
        <h3>{clientLabel(client.id as ClientId, locale)}</h3>
        <span className="state-label">{copy.stateLabels[client.state]}</span>
      </div>
      <p>
        {localizedClientDetail(client.detail, locale, client.id as ClientId)}
      </p>
      <span className="verification-time">
        {client.schema ?? copy.noSchema}
        {client.configPath ? ` · ${client.configPath}` : ""}
      </span>
    </article>
  );
}

function bridgeLabel(bridge: BridgeId): string {
  return bridge === "illustrator" ? "Illustrator" : "InDesign";
}
