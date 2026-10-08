import type {
  BridgeId,
  ClientId,
  ConfigPreview,
} from "@adobe-ai-bridge/client-config";
import { createConfigPreview } from "@adobe-ai-bridge/client-config";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { LanguagePreference, Locale } from "./i18n";
import {
  detectSystemLocale,
  formatTemplate,
  localizeActionResult,
  readLanguagePreference,
  saveLanguagePreference,
  strings,
} from "./i18n";
import type { ActionResult, ClientConfigDocument } from "./types";

const bridges: BridgeId[] = ["illustrator", "indesign"];
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
    opencode: true,
    workbuddy: true,
  });
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);

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

  const chooseLanguage = (preference: LanguagePreference) => {
    setLanguagePreference(preference);
    saveLanguagePreference(preference);
  };

  const toggleClient = (client: ClientId) => {
    setSelectedClients((current) => ({
      ...current,
      [client]: !current[client],
    }));
  };

  const install = async () => {
    if (!native || busy) return;
    setBusy(true);
    setResult(null);
    setPhase(copy.installingRuntimes);

    try {
      const runtimeResult = await invoke<ActionResult>("install_all_command");
      if (!runtimeResult.ok) {
        setResult(localizeActionResult(runtimeResult, locale, copy));
        return;
      }

      const selected = clients.filter((id) => selectedClients[id]);
      if (selected.length === 0) {
        setResult(localizeActionResult(runtimeResult, locale, copy));
        return;
      }

      setPhase(copy.connectingClients);
      const launcherPath = await invoke<string>("get_launcher_path_command");
      const issues: string[] = [];
      for (const client of selected) {
        for (const bridge of bridges) {
          try {
            const document = await invoke<ClientConfigDocument>(
              "read_client_config_command",
              { client },
            );
            const preview: ConfigPreview = createConfigPreview({
              client,
              bridge,
              configPath: document.path,
              text: document.text,
              launcherPath,
            });
            if (preview.conflict) {
              issues.push(
                formatTemplate(copy.clientConflict, {
                  client: copy.clientLabels[client],
                  bridge: copy.bridgeLabels[bridge],
                }),
              );
              continue;
            }
            if (preview.alreadyConfigured) continue;

            const applied = await invoke<ActionResult>(
              "apply_client_config_command",
              {
                client,
                bridgeId: bridge,
                expectedSha256: document.sha256,
                text: preview.after,
              },
            );
            if (!applied.ok) {
              const localized = localizeActionResult(applied, locale, copy);
              issues.push(
                formatTemplate(copy.clientIssue, {
                  client: copy.clientLabels[client],
                  error: localized.message,
                }),
              );
            }
          } catch (error) {
            issues.push(
              formatTemplate(copy.clientIssue, {
                client: copy.clientLabels[client],
                error: errorText(error),
              }),
            );
          }
        }
      }

      const localizedRuntimeResult = localizeActionResult(
        runtimeResult,
        locale,
        copy,
      );
      setResult(
        issues.length > 0
          ? {
              ...localizedRuntimeResult,
              ok: false,
              code: "CLIENT_CONFIGURATION_INCOMPLETE",
              message: formatTemplate(copy.clientsNeedAttention, {
                issues: issues.join(" "),
              }),
              recovery: copy.resolveClientConflict,
              lastVerifiedLayer: "client configuration",
              timestamp: new Date().toISOString(),
            }
          : {
              ...localizedRuntimeResult,
              message: `${localizedRuntimeResult.message} ${formatTemplate(
                copy.configuredClients,
                {
                  clients: selected
                    .map((id) => copy.clientLabels[id])
                    .join(", "),
                },
              )}`,
            },
      );
    } catch (error) {
      setResult(
        localizeActionResult(
          failure(
            formatTemplate(copy.installationFailed, {
              error: errorText(error),
            }),
            copy.retryInstall,
          ),
          locale,
          copy,
        ),
      );
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
      setResult(localizeActionResult(panelResult, locale, copy));
    } catch (error) {
      setResult(
        localizeActionResult(
          failure(
            formatTemplate(copy.panelSetupFailed, { error: errorText(error) }),
            copy.retryPanel,
          ),
          locale,
          copy,
        ),
      );
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
            className={`notice installer-notice ${result.ok ? "notice-success" : "notice-error"}`}
            role="status"
            aria-live="polite"
          >
            <div className="notice-heading">{result.message}</div>
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
