export type Locale = "en" | "zh-CN";
export type LanguagePreference = "system" | Locale;

const en = {
  language: "Language",
  followSystem: "System default",
  english: "English",
  simplifiedChinese: "简体中文",
  appHome: "Adobe AI Bridge home",
  appVersion: "Illustrator · InDesign",
  metaDescription:
    "Install and connect the Adobe Illustrator and InDesign MCP bridges.",
  eyebrow: "LIGHTWEIGHT ADOBE MCP BRIDGE",
  pageTitle: "Install the full toolset",
  pageIntro:
    "Install both bridges and connect them to your selected agent clients. Agents can edit open documents and run trusted JSX scripts directly in Adobe apps.",
  clientsEyebrow: "AGENT CLIENTS",
  configureClients: "Configure clients",
  clientDetectionHint:
    "Installed clients are selected automatically. You can change the selection.",
  installUpdate: "Install / Update",
  working: "Working…",
  installingRuntimes: "Installing or replacing both Adobe runtimes…",
  connectingClients: "Connecting the selected clients…",
  clientConflict:
    "{client}: the {bridge} entry already exists with different settings.",
  clientIssue: "{client}: {error}",
  clientsNeedAttention: "Some client entries need attention: {issues}",
  resolveClientConflict:
    "Resolve the conflicting client entries, then run Install / Update again. Existing client settings were preserved.",
  configuredClients: "Configured: {clients}.",
  noClientSelected: "No agent clients were selected.",
  noClientSelectedRecovery:
    "Run Install / Update again after selecting the client you want to connect.",
  noClientsConfigured: "No client entries were configured.",
  noRuntimeForClientConfig:
    "No bridge runtime was installed, so no client entries were written.",
  clientIssues: "Configuration issues: {issues}",
  runtimeStatus: "Runtimes: {detail}",
  clientStatus: "Clients: {detail}",
  proxyStatus: "InDesign proxy: {detail}",
  proxyReady:
    "The proxy is healthy. Connect the InDesign panel before editing InDesign documents.",
  proxyNotReady: "The InDesign proxy is not ready.",
  proxyNotStarted: "The proxy was not started.",
  proxyWarning:
    "Selected client entries were still configured. Retry the proxy when ready.",
  proxyPendingRecovery:
    "The MCP entries are installed. Review the InDesign proxy log and run Install / Update again after correcting the proxy issue.",
  installationFailed: "Installation could not complete: {error}",
  retryInstall:
    "Check that this is a complete Adobe AI Bridge build, then run Install / Update again.",
  panelHeading: "InDesign panel",
  panelDescription:
    "Creative Cloud requires you to approve the panel installation. This opens the installer and copies the connection token.",
  setupPanel: "Set up InDesign panel",
  openingPanelInstaller: "Opening the InDesign panel installer…",
  panelSetupFailed: "The InDesign panel setup could not start: {error}",
  retryPanel: "Run Install / Update first, then retry the panel setup.",
  desktopOnly: "Run Install / Update from the Adobe AI Bridge desktop app.",
  installedRuntimes: "Installed both Adobe bridges.",
  installedRuntimesRecovery:
    "Restart or reload the selected clients to load the full tool lists.",
  installIncomplete: "Some Adobe bridge runtimes could not be installed.",
  installFailed: "The Adobe bridges could not be installed.",
  panelOpened:
    "Creative Cloud was asked to open the InDesign panel installer, and the connection token was copied.",
  panelOpenedRecovery:
    "Approve the installation in Creative Cloud, open the Adobe AI Bridge panel in InDesign, paste the copied token, then connect.",
  panelPackageMissing:
    "This build does not contain the InDesign panel installer.",
  panelPackageMissingRecovery:
    "Rebuild the InDesign runtime bundle and the desktop app, then try again.",
  panelOpenFailed:
    "Creative Cloud could not open the InDesign panel installer.",
  panelOpenFailedRecovery:
    "Open the InDesign package from the manager application resources. The connection token is already copied.",
  unsupportedPlatform: "InDesign panel setup is only supported on macOS.",
  unsupportedPlatformRecovery: "Run Adobe AI Bridge on an Apple Silicon Mac.",
  tokenCopied: "A one-time local connection token was copied to the clipboard.",
  tokenCopiedRecovery:
    "Paste it into the Adobe AI Bridge panel in InDesign. The manager does not log or display the token.",
  tokenCopyFailed: "macOS could not copy the one-time UXP token.",
  tokenCopyFailedRecovery: "Retry after the desktop is ready.",
  genericFailure: "The operation could not complete.",
  genericRecovery: "Run Install / Update again. Reference: {code}.",
  detailsPrefix: "Details: ",
  clientLabels: {
    opencode: "OpenCode",
    workbuddy: "Tencent WorkBuddy",
  },
  bridgeLabels: {
    illustrator: "Illustrator",
    indesign: "InDesign",
  },
} as const;

const zhCN = {
  language: "语言",
  followSystem: "跟随系统",
  english: "English",
  simplifiedChinese: "简体中文",
  appHome: "Adobe AI Bridge 主页",
  appVersion: "Illustrator · InDesign",
  metaDescription: "安装并连接 Adobe Illustrator 与 InDesign MCP 桥接服务。",
  eyebrow: "轻量级 ADOBE MCP BRIDGE",
  pageTitle: "安装完整工具集",
  pageIntro:
    "安装 Illustrator 和 InDesign 两套桥接服务，并连接所选 Agent 客户端。Agent 可以直接编辑已打开的文档，也可以在 Adobe 应用中运行可信的 JSX 脚本。",
  clientsEyebrow: "AGENT 客户端",
  configureClients: "配置客户端",
  clientDetectionHint: "自动勾选已检测到的客户端；你也可以自行更改选择。",
  installUpdate: "安装 / 更新",
  working: "处理中…",
  installingRuntimes: "正在安装或替换两套 Adobe 运行时…",
  connectingClients: "正在连接所选客户端…",
  clientConflict: "{client}：{bridge} 条目已存在，但配置内容不同。",
  clientIssue: "{client}：{error}",
  clientsNeedAttention: "部分客户端条目需要处理：{issues}",
  resolveClientConflict:
    "解决冲突的客户端条目后，再次运行“安装 / 更新”。现有客户端设置已保留。",
  configuredClients: "已配置：{clients}。",
  noClientSelected: "未选择 Agent 客户端。",
  noClientSelectedRecovery: "选择要连接的客户端后，再次运行“安装 / 更新”。",
  noClientsConfigured: "没有写入客户端条目。",
  noRuntimeForClientConfig: "没有 bridge 安装成功，因此没有写入客户端条目。",
  clientIssues: "配置问题：{issues}",
  runtimeStatus: "运行时：{detail}",
  clientStatus: "客户端：{detail}",
  proxyStatus: "InDesign proxy：{detail}",
  proxyReady: "Proxy 运行正常。编辑 InDesign 文档前，请先连接 InDesign 面板。",
  proxyNotReady: "InDesign proxy 尚未就绪。",
  proxyNotStarted: "Proxy 未启动。",
  proxyWarning: "所选客户端条目已写入。Proxy 修复后可再次运行“安装 / 更新”。",
  proxyPendingRecovery:
    "MCP 条目已安装。请检查 InDesign proxy 日志，排除问题后再次运行“安装 / 更新”。",
  installationFailed: "安装未完成：{error}",
  retryInstall:
    "确认这是完整的 Adobe AI Bridge 安装包，然后再次运行“安装 / 更新”。",
  panelHeading: "InDesign 面板",
  panelDescription:
    "Creative Cloud 要求你手动批准面板安装。此操作会打开安装器并复制连接令牌。",
  setupPanel: "设置 InDesign 面板",
  openingPanelInstaller: "正在打开 InDesign 面板安装器…",
  panelSetupFailed: "无法启动 InDesign 面板设置：{error}",
  retryPanel: "先运行“安装 / 更新”，然后重试面板设置。",
  desktopOnly: "请在 Adobe AI Bridge 桌面应用中运行“安装 / 更新”。",
  installedRuntimes: "Illustrator 和 InDesign 桥接服务均已安装。",
  installedRuntimesRecovery: "重启或重新加载所选客户端，即可载入完整工具列表。",
  installIncomplete: "部分 Adobe 桥接运行时未能安装。",
  installFailed: "Adobe 桥接服务安装失败。",
  panelOpened:
    "已请求 Creative Cloud 打开 InDesign 面板安装器，并已复制连接令牌。",
  panelOpenedRecovery:
    "请在 Creative Cloud 中批准安装，在 InDesign 中打开 Adobe AI Bridge 面板，粘贴令牌并连接。",
  panelPackageMissing: "此安装包不包含 InDesign 面板安装程序。",
  panelPackageMissingRecovery: "请重新构建 InDesign 运行时和桌面应用后重试。",
  panelOpenFailed: "Creative Cloud 无法打开 InDesign 面板安装器。",
  panelOpenFailedRecovery:
    "请从管理器应用资源中打开 InDesign 安装包。连接令牌已复制。",
  unsupportedPlatform: "InDesign 面板设置目前仅支持 macOS。",
  unsupportedPlatformRecovery:
    "请在 Apple Silicon Mac 上运行 Adobe AI Bridge。",
  tokenCopied: "一次性本机连接令牌已复制到剪贴板。",
  tokenCopiedRecovery:
    "请将令牌粘贴到 InDesign 中的 Adobe AI Bridge 面板。管理器不会记录或显示令牌。",
  tokenCopyFailed: "macOS 无法复制一次性 UXP 令牌。",
  tokenCopyFailedRecovery: "请在桌面环境就绪后重试。",
  genericFailure: "操作未能完成。",
  genericRecovery: "请再次运行“安装 / 更新”。参考代码：{code}。",
  detailsPrefix: "详细信息：",
  clientLabels: {
    opencode: "OpenCode",
    workbuddy: "腾讯 WorkBuddy",
  },
  bridgeLabels: {
    illustrator: "Illustrator",
    indesign: "InDesign",
  },
} as const;

export type UiStrings = {
  [Key in keyof typeof en]: (typeof en)[Key] extends Record<string, string>
    ? { [NestedKey in keyof (typeof en)[Key]]: string }
    : string;
};

export const strings: Record<Locale, UiStrings> = {
  en,
  "zh-CN": zhCN,
};

const preferenceStorageKey = "adobe-ai-bridge.language";

export function detectSystemLocale(language?: string): Locale {
  const preferredLanguage =
    language ??
    (typeof navigator === "undefined"
      ? "en"
      : (navigator.languages?.[0] ?? navigator.language ?? "en"));
  return /^zh(?:-|$)/i.test(preferredLanguage) ? "zh-CN" : "en";
}

export function readLanguagePreference(): LanguagePreference {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(preferenceStorageKey);
    return value === "en" || value === "zh-CN" || value === "system"
      ? value
      : "system";
  } catch {
    return "system";
  }
}

export function saveLanguagePreference(preference: LanguagePreference): void {
  try {
    window.localStorage.setItem(preferenceStorageKey, preference);
  } catch {
    // The selected language still applies for this session when storage is unavailable.
  }
}

export function formatTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export function localizeActionResult<T extends ActionResultLike>(
  result: T,
  locale: Locale,
  copy: UiStrings,
): T {
  if (locale === "en") return result;

  const codeTranslations: Record<string, [string, string]> = {
    BRIDGES_INSTALLED: [copy.installedRuntimes, copy.installedRuntimesRecovery],
    BRIDGE_INSTALL_INCOMPLETE: [
      `${copy.installIncomplete} ${copy.detailsPrefix}${result.message}`,
      copy.retryInstall,
    ],
    BRIDGE_INSTALL_FAILED: [
      `${copy.installFailed} ${copy.detailsPrefix}${result.message}`,
      copy.retryInstall,
    ],
    INDESIGN_PROXY_NOT_HEALTHY: [
      `${copy.proxyNotReady} ${copy.detailsPrefix}${result.message}`,
      copy.proxyPendingRecovery,
    ],
    INDESIGN_PANEL_SETUP_OPENED: [copy.panelOpened, copy.panelOpenedRecovery],
    UXP_PACKAGE_MISSING: [
      copy.panelPackageMissing,
      copy.panelPackageMissingRecovery,
    ],
    UXP_OPEN_FAILED: [copy.panelOpenFailed, copy.panelOpenFailedRecovery],
    UNSUPPORTED_PLATFORM: [
      copy.unsupportedPlatform,
      copy.unsupportedPlatformRecovery,
    ],
    INDESIGN_TOKEN_COPIED: [copy.tokenCopied, copy.tokenCopiedRecovery],
    CLIPBOARD_UNAVAILABLE: [copy.tokenCopyFailed, copy.tokenCopyFailedRecovery],
    INSTALL_FAILED: [result.message, result.recovery],
    PANEL_SETUP_FAILED: [result.message, result.recovery],
    CONFIG_CHANGED: [
      "预览后客户端配置已发生变化，未写入任何内容。",
      "请重新读取配置并再次运行安装。",
    ],
    CONFIG_INVALID: [
      "客户端现有配置不是有效的 JSONC。",
      "请在对应客户端中修复配置格式后重试。",
    ],
    CONFIG_WRITE_FAILED: [
      "无法安全写入客户端配置。",
      "原文件已保留。请检查目录权限后重试。",
    ],
    CONFIG_CONFLICT: [
      "已有其他配置使用了此桥接服务名称。",
      "请检查并处理现有客户端条目后重试。",
    ],
    LAUNCHER_NOT_INSTALLED: [
      "Adobe AI Bridge 启动器尚未安装。",
      "请先运行“安装 / 更新”，然后重试客户端配置。",
    ],
    HOME_UNAVAILABLE: [
      "无法确定当前用户的主目录。",
      "请登录 macOS 用户账户后重试。",
    ],
    CONFIG_READ_FAILED: [
      "无法读取客户端配置。",
      "请检查配置文件路径和访问权限后重试。",
    ],
    CONFIG_SYMLINK_REJECTED: [
      "客户端配置是符号链接，管理器没有读取或修改它。",
      "请将配置文件放在受支持的用户目录中后重试。",
    ],
  };
  const translation = codeTranslations[result.code];
  if (translation) {
    return { ...result, message: translation[0], recovery: translation[1] };
  }

  return {
    ...result,
    message: `${copy.genericFailure} ${copy.detailsPrefix}${result.message}`,
    recovery: `${formatTemplate(copy.genericRecovery, { code: result.code })} ${copy.detailsPrefix}${result.recovery}`,
  };
}

type ActionResultLike = {
  code: string;
  message: string;
  recovery: string;
};
