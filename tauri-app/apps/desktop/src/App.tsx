import type {
  BridgeId,
  ClientId,
  ConfigPreview,
} from "@adobe-ai-bridge/client-config";
import { createConfigPreview } from "@adobe-ai-bridge/client-config";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { ActionResult, ClientConfigDocument } from "./types";

const bridges: BridgeId[] = ["illustrator", "indesign"];
const clients: Array<{ id: ClientId; label: string }> = [
  { id: "opencode", label: "OpenCode" },
  { id: "workbuddy", label: "Tencent WorkBuddy" },
];

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
  const [selectedClients, setSelectedClients] = useState<
    Record<ClientId, boolean>
  >({
    opencode: true,
    workbuddy: true,
  });
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);

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
    setPhase("Installing or replacing both Adobe runtimes…");

    try {
      const runtimeResult = await invoke<ActionResult>("install_all_command");
      if (!runtimeResult.ok) {
        setResult(runtimeResult);
        return;
      }

      const selected = clients.filter(({ id }) => selectedClients[id]);
      if (selected.length === 0) {
        setResult(runtimeResult);
        return;
      }

      setPhase("Connecting the selected clients…");
      const launcherPath = await invoke<string>("get_launcher_path_command");
      const issues: string[] = [];
      for (const client of selected) {
        for (const bridge of bridges) {
          try {
            const document = await invoke<ClientConfigDocument>(
              "read_client_config_command",
              { client: client.id },
            );
            const preview: ConfigPreview = createConfigPreview({
              client: client.id,
              bridge,
              configPath: document.path,
              text: document.text,
              launcherPath,
            });
            if (preview.conflict) {
              issues.push(
                `${client.label}: ${bridge} entry already exists with different settings.`,
              );
              continue;
            }
            if (preview.alreadyConfigured) continue;

            const applied = await invoke<ActionResult>(
              "apply_client_config_command",
              {
                client: client.id,
                bridgeId: bridge,
                expectedSha256: document.sha256,
                text: preview.after,
              },
            );
            if (!applied.ok) issues.push(`${client.label}: ${applied.message}`);
          } catch (error) {
            issues.push(`${client.label}: ${errorText(error)}`);
          }
        }
      }

      setResult(
        issues.length > 0
          ? {
              ...runtimeResult,
              ok: false,
              code: "CLIENT_CONFIGURATION_INCOMPLETE",
              message: `Both runtimes are installed. Some client entries need attention: ${issues.join(" ")}`,
              recovery:
                "Resolve the conflicting client entries, then run Install / Update again. Existing client settings were preserved.",
              lastVerifiedLayer: "client configuration",
              timestamp: new Date().toISOString(),
            }
          : {
              ...runtimeResult,
              message: `${runtimeResult.message} Configured: ${selected.map(({ label }) => label).join(", ")}.`,
            },
      );
    } catch (error) {
      setResult(
        failure(
          `Installation could not complete: ${errorText(error)}`,
          "Check that this is a complete Adobe AI Bridge build, then run Install / Update again.",
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
    setPhase("Opening the InDesign panel installer…");
    try {
      setResult(await invoke<ActionResult>("setup_indesign_panel_command"));
    } catch (error) {
      setResult(
        failure(
          `The InDesign panel setup could not start: ${errorText(error)}`,
          "Run Install / Update first, then retry the panel setup.",
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
        <a
          className="wordmark"
          href="#install"
          aria-label="Adobe AI Bridge home"
        >
          <span className="wordmark-mark" aria-hidden="true">
            AB
          </span>
          <span>
            Adobe <strong>AI Bridge</strong>
          </span>
        </a>
        <span className="app-version">Illustrator · InDesign</span>
      </header>

      <section className="page-heading" id="install">
        <div className="eyebrow">LIGHTWEIGHT ADOBE MCP BRIDGE</div>
        <h1>Install the full toolset</h1>
        <p>
          Install both bridges and connect them to your selected agent clients.
          Agents can edit open documents and run trusted JSX scripts directly in
          Adobe apps.
        </p>
      </section>

      <section className="installer-card" aria-labelledby="client-heading">
        <div className="installer-card-heading">
          <div>
            <div className="eyebrow">AGENT CLIENTS</div>
            <h2 id="client-heading">Configure clients</h2>
          </div>
        </div>
        <div className="client-options">
          {clients.map((client) => (
            <label className="client-option" key={client.id}>
              <input
                type="checkbox"
                checked={selectedClients[client.id]}
                disabled={busy}
                onChange={() => toggleClient(client.id)}
              />
              <span>{client.label}</span>
            </label>
          ))}
        </div>

        <button
          type="button"
          className="button button-primary install-button"
          disabled={!native || busy}
          onClick={() => void install()}
        >
          {busy ? "Working…" : "Install / Update"}
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
            Run Install / Update from the Adobe AI Bridge desktop app.
          </aside>
        ) : null}
      </section>

      <section className="panel-setup" aria-labelledby="panel-heading">
        <div>
          <h2 id="panel-heading">InDesign panel</h2>
          <p>
            Creative Cloud requires you to approve the panel installation. This
            opens the installer and copies the connection token.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          disabled={!native || busy}
          onClick={() => void setupInDesignPanel()}
        >
          Set up InDesign panel
        </button>
      </section>
    </main>
  );
}
