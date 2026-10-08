import type { ClientId } from "@adobe-ai-bridge/client-config";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { LanguagePreference, Locale } from "./i18n";
import {
  detectSystemLocale,
  formatTemplate,
  localizeActionResult,
  readLanguagePreference,
  saveLanguagePreference,
  strings,
} from "./i18n";
import { completeInstallation } from "./installer";
import type {
  ActionResult,
  DetectedClients,
  InstallNotice,
  InstallReport,
} from "./types";

const clients: ClientId[] = ["opencode", "workbuddy"];

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function failure(message: string, recovery: string): ActionResult {
  return {
    ok: false,
    code: "INSTALL_FAILED",
    message,
    recovery,
    lastVerifiedLayer: "installer",
    timestamp: new Date().toISOString(),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const [native] = useState(isTauri);
  const [languagePreference, setLanguagePreference] =
    useState<LanguagePreference>(readLanguagePreference);
  const [systemLocale, setSystemLocale] = useState<Locale>(detectSystemLocale);
  const locale =
    languagePreference === "system" ? systemLocale : languagePreference;
  const copy = strings[locale];
  const [selectedClients, setSelectedClients] = useState<
    Record<ClientId, boolean>
  >({
    opencode: false,
    workbuddy: false,
  });
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<InstallNotice | null>(null);
  const selectedClientsRef = useRef(selectedClients);
  const manuallySelectedClients = useRef<Record<ClientId, boolean>>({
    opencode: false,
    workbuddy: false,
  });
  const clientDetection = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    document.documentElement.lang = locale;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", copy.metaDescription);
    const updateSystemLocale = () => setSystemLocale(detectSystemLocale());
    window.addEventListener("languagechange", updateSystemLocale);
    return () =>
      window.removeEventListener("languagechange", updateSystemLocale);
  }, [copy.metaDescription, locale]);

  useEffect(() => {
    if (!native) return;

    let active = true;
    clientDetection.current = invoke<DetectedClients>("detect_clients_command")
      .then((detected) => {
        if (!active) return;
        const next = { ...selectedClientsRef.current };
        for (const client of clients) {
          if (!manuallySelectedClients.current[client]) {
            next[client] = detected[client];
          }
        }
        selectedClientsRef.current = next;
        setSelectedClients(next);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [native]);

  const chooseLanguage = (preference: LanguagePreference) => {
    setLanguagePreference(preference);
    saveLanguagePreference(preference);
  };

  const toggleClient = (client: ClientId) => {
    manuallySelectedClients.current[client] = true;
    const next = {
      ...selectedClientsRef.current,
      [client]: !selectedClientsRef.current[client],
    };
    selectedClientsRef.current = next;
    setSelectedClients(next);
  };

  const install = async () => {
    if (!native || busy) return;
    setBusy(true);
    setResult(null);
    setPhase(copy.installingRuntimes);

    try {
      await clientDetection.current;
      const report = await invoke<InstallReport>("install_all_command");

      const selected = clients.filter((id) => selectedClientsRef.current[id]);
      if (selected.length > 0 && report.installedBridges.length > 0) {
        setPhase(copy.connectingClients);
      }
      setResult(
        await completeInstallation({
          report,
          clients: selected,
          locale,
          copy,
          invoke,
        }),
      );
    } catch (error) {
      const failed = localizeActionResult(
        failure(
          formatTemplate(copy.installationFailed, {
            error: errorText(error),
          }),
          copy.retryInstall,
        ),
        locale,
        copy,
      );
      setResult({
        message: failed.message,
        recovery: failed.recovery,
        severity: "error",
      });
    } finally {
      setBusy(false);
      setPhase("");
    }
  };

  const setupInDesignPanel = async () => {
    if (!native || busy) return;
    setBusy(true);
    setResult(null);
    setPhase(copy.openingPanelInstaller);
    try {
      const panelResult = await invoke<ActionResult>(
        "setup_indesign_panel_command",
      );
      const localized = localizeActionResult(panelResult, locale, copy);
      setResult({
        message: localized.message,
        recovery: localized.recovery,
        severity: localized.ok ? "success" : "error",
      });
    } catch (error) {
      const failed = localizeActionResult(
        failure(
          formatTemplate(copy.panelSetupFailed, { error: errorText(error) }),
          copy.retryPanel,
        ),
        locale,
        copy,
      );
      setResult({
        message: failed.message,
        recovery: failed.recovery,
        severity: "error",
      });
    } finally {
      setBusy(false);
      setPhase("");
    }
  };

  return (
    <main className="app-shell installer-shell">
      <header className="topbar">
        <a className="wordmark" href="#install" aria-label={copy.appHome}>
          <span className="wordmark-mark" aria-hidden="true">
            AB
          </span>
          <span>
            Adobe <strong>AI Bridge</strong>
          </span>
        </a>
        <div className="topbar-tools">
          <label className="language-control">
            <span>{copy.language}</span>
            <select
              aria-label={copy.language}
              value={languagePreference}
              onChange={(event) =>
                chooseLanguage(event.target.value as LanguagePreference)
              }
            >
              <option value="system">{copy.followSystem}</option>
              <option value="en">{copy.english}</option>
              <option value="zh-CN">{copy.simplifiedChinese}</option>
            </select>
          </label>
          <span className="app-version">{copy.appVersion}</span>
        </div>
      </header>

      <section className="page-heading" id="install">
        <div className="eyebrow">{copy.eyebrow}</div>
        <h1>{copy.pageTitle}</h1>
        <p>{copy.pageIntro}</p>
      </section>

      <section className="installer-card" aria-labelledby="client-heading">
        <div className="installer-card-heading">
          <div>
            <div className="eyebrow">{copy.clientsEyebrow}</div>
            <h2 id="client-heading">{copy.configureClients}</h2>
          </div>
        </div>
        <div className="client-options">
          {clients.map((client) => (
            <label className="client-option" key={client}>
              <input
                type="checkbox"
                checked={selectedClients[client]}
                disabled={busy}
                onChange={() => toggleClient(client)}
              />
              <span>{copy.clientLabels[client]}</span>
            </label>
          ))}
        </div>
        <p className="client-detection-hint">{copy.clientDetectionHint}</p>

        <button
          type="button"
          className="button button-primary install-button"
          disabled={!native || busy}
          onClick={() => void install()}
        >
          {busy ? copy.working : copy.installUpdate}
        </button>

        {busy ? (
          <div className="install-progress" role="status" aria-live="polite">
            <span className="progress-spinner" aria-hidden="true" />
            <span>{phase}</span>
          </div>
        ) : null}

        {result ? (
          <aside
            className={`notice installer-notice notice-${result.severity}`}
            role="status"
            aria-live="polite"
          >
            <div className="notice-heading installer-result-heading">
              {result.message}
            </div>
            <div>{result.recovery}</div>
          </aside>
        ) : null}

        {!native ? (
          <aside className="notice notice-warning" role="status">
            {copy.desktopOnly}
          </aside>
        ) : null}
      </section>

      <section className="panel-setup" aria-labelledby="panel-heading">
        <div>
          <h2 id="panel-heading">{copy.panelHeading}</h2>
          <p>{copy.panelDescription}</p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          disabled={!native || busy}
          onClick={() => void setupInDesignPanel()}
        >
          {copy.setupPanel}
        </button>
      </section>
    </main>
  );
}
