import type {
  BridgeId,
  ClientId,
  ConfigPreview,
} from "@adobe-ai-bridge/client-config";
import { createConfigPreview } from "@adobe-ai-bridge/client-config";
import type { Locale, UiStrings } from "./i18n";
import { formatTemplate, localizeActionResult } from "./i18n";
import type {
  ActionResult,
  ClientConfigDocument,
  InstallNotice,
  InstallReport,
} from "./types";

export type InvokeCommand = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export type ClientConfigurationResult = {
  configured: string[];
  issues: string[];
};

export async function completeInstallation(input: {
  report: InstallReport;
  clients: ClientId[];
  locale: Locale;
  copy: UiStrings;
  invoke: InvokeCommand;
}): Promise<InstallNotice> {
  const configuration = await configureClients({
    clients: input.clients,
    bridges: input.report.installedBridges,
    locale: input.locale,
    copy: input.copy,
    invoke: input.invoke,
  });
  const runtimeResult = localizeActionResult(
    input.report.runtimeResult,
    input.locale,
    input.copy,
  );
  const proxyResult = input.report.proxyResult
    ? localizeActionResult(input.report.proxyResult, input.locale, input.copy)
    : null;
  const clientSummary =
    input.clients.length === 0
      ? input.copy.noClientSelected
      : configuration.configured.length > 0
        ? formatTemplate(input.copy.configuredClients, {
            clients: configuration.configured.join(", "),
          })
        : input.report.installedBridges.length === 0
          ? input.copy.noRuntimeForClientConfig
          : input.copy.noClientsConfigured;
  const clientStatus =
    configuration.issues.length > 0
      ? `${clientSummary} ${formatTemplate(input.copy.clientIssues, {
          issues: configuration.issues.join(" "),
        })}`
      : clientSummary;
  const proxyStatus = proxyResult
    ? proxyResult.ok
      ? input.copy.proxyReady
      : `${proxyResult.message} ${input.copy.proxyWarning}`
    : input.copy.proxyNotStarted;
  const severity: InstallNotice["severity"] =
    !input.report.runtimeResult.ok || configuration.issues.length > 0
      ? "error"
      : proxyResult?.ok === false
        ? "warning"
        : "success";

  return {
    message: [
      formatTemplate(input.copy.runtimeStatus, {
        detail: runtimeResult.message,
      }),
      formatTemplate(input.copy.clientStatus, { detail: clientStatus }),
      formatTemplate(input.copy.proxyStatus, { detail: proxyStatus }),
    ].join("\n"),
    recovery: [
      !input.report.runtimeResult.ok ? runtimeResult.recovery : "",
      configuration.issues.length > 0 ? input.copy.resolveClientConflict : "",
      proxyResult?.ok === false ? input.copy.proxyPendingRecovery : "",
      severity === "success"
        ? input.clients.length > 0
          ? input.copy.installedRuntimesRecovery
          : input.copy.noClientSelectedRecovery
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    severity,
  };
}

export async function configureClients(input: {
  clients: ClientId[];
  bridges: BridgeId[];
  locale: Locale;
  copy: UiStrings;
  invoke: InvokeCommand;
}): Promise<ClientConfigurationResult> {
  const configured: string[] = [];
  const issues: string[] = [];
  if (input.clients.length === 0 || input.bridges.length === 0) {
    return { configured, issues };
  }

  let launcherPath: string;
  try {
    launcherPath = await input.invoke<string>("get_launcher_path_command");
  } catch (error) {
    issues.push(errorText(error));
    return { configured, issues };
  }

  for (const client of input.clients) {
    for (const bridge of input.bridges) {
      try {
        const document = await input.invoke<ClientConfigDocument>(
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
            formatTemplate(input.copy.clientConflict, {
              client: input.copy.clientLabels[client],
              bridge: input.copy.bridgeLabels[bridge],
            }),
          );
          continue;
        }
        if (preview.alreadyConfigured) {
          configured.push(
            `${input.copy.clientLabels[client]} (${input.copy.bridgeLabels[bridge]})`,
          );
          continue;
        }

        const applied = await input.invoke<ActionResult>(
          "apply_client_config_command",
          {
            client,
            bridgeId: bridge,
            expectedSha256: document.sha256,
            text: preview.after,
          },
        );
        if (!applied.ok) {
          const localized = localizeActionResult(
            applied,
            input.locale,
            input.copy,
          );
          issues.push(
            formatTemplate(input.copy.clientIssue, {
              client: input.copy.clientLabels[client],
              error: localized.message,
            }),
          );
        } else {
          configured.push(
            `${input.copy.clientLabels[client]} (${input.copy.bridgeLabels[bridge]})`,
          );
        }
      } catch (error) {
        issues.push(
          formatTemplate(input.copy.clientIssue, {
            client: input.copy.clientLabels[client],
            error: errorText(error),
          }),
        );
      }
    }
  }

  return { configured, issues };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
