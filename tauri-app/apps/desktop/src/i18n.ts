import type { BridgeId, CheckState, ClientId } from "./types";

export type Locale = "en" | "zh-CN";
export type LanguagePreference = "system" | Locale;

const en = {
  homeLabel: "Adobe AI Bridge home",
  manager: "Manager",
  language: "Language",
  followSystem: "Follow system",
  english: "English",
  simplifiedChinese: "简体中文",
  stateLabels: {
    not_installed: "Not detected",
    installed_not_running: "Ready to configure",
    waiting_for_plugin: "Waiting for plugin",
    connected: "Connected",
    degraded: "Needs verification",
    error: "Error",
  } satisfies Record<CheckState, string>,
  notVerified: "Not verified",
  lastVerified: "Last verified",
  browserPreviewLabel: "Browser preview",
  browserPreviewDetail:
    "Run the desktop application to inspect local software and connections.",
  previewOnly:
    "Browser preview mode. Local app detection, installation and client configuration are available in the desktop app.",
  localAdobeManager: "LOCAL ADOBE CONNECTION MANAGER",
  pageTitle: "Two bridges. One place to manage them.",
  pageIntro:
    "Install either engine independently, connect both AI clients, and verify each layer before using a document tool.",
  independentEngineStatus: "INDEPENDENT ENGINE STATUS",
  adobeApplications: "Adobe applications",
  refreshDiagnostics: "Refresh diagnostics",
  refresh: "Refresh",
  vectorDesign: "VECTOR DESIGN",
  pageLayout: "PAGE LAYOUT",
  runtime: "Runtime",
  runtimeNotInstalled: "Runtime not installed",
  installing: "Installing…",
  updateRuntime: "Update runtime",
  installRuntime: "Install runtime",
  rollingBack: "Rolling back…",
  rollbackRuntime: "Rollback runtime",
  uninstalling: "Uninstalling…",
  uninstallRuntime: "Uninstall runtime",
  starting: "Starting…",
  startProxy: "Start proxy",
  stopping: "Stopping…",
  stopProxy: "Stop proxy",
  copyUxpToken: "Copy UXP token",
  openUxpInstaller: "Open UXP installer",
  adobeApplication: "Adobe application",
  managedRuntime: "Managed runtime",
  loopbackProxy: "Loopback proxy",
  clientProcess: "Client process",
  uxpPanel: "UXP panel",
  automationPermission: "Automation permission",
  mcpReadCheck: "MCP read check",
  fourConnections: "FOUR SEPARATE MCP CONNECTIONS",
  clientHeading: "OpenCode and Tencent WorkBuddy",
  clientIntro:
    "Each client gets a distinct server entry for each Adobe application.",
  aiClient: "AI client",
  adobeBridge: "Adobe bridge",
  illustratorMcp: "Illustrator MCP",
  indesignMcp: "InDesign MCP",
  preparingPreview: "Preparing preview…",
  previewInstall: "Preview install",
  previewRemoval: "Preview removal",
  existingEntryPreserved:
    "The existing entry is preserved because it differs from the manager-owned value.",
  noFileChanges: "No file changes are required.",
  selectedEntryAbsent: "The selected bridge entry is already absent.",
  entryWillBeAdded:
    "Only the selected Adobe AI Bridge entry will be added. Existing client settings remain in place.",
  entryWillBeRemoved:
    "Only the selected Adobe AI Bridge entry will be removed. The current file will be backed up first.",
  applyingSafely: "Applying safely…",
  applyEntry: "Apply this entry",
  removeEntry: "Remove this entry",
  noSchema: "No schema detected",
  localManagerFooter:
    "Local manager · document content is not included in diagnostics",
  verificationFooter:
    "Checks are dated and separated from real application verification",
  uninstallConfirm:
    "Uninstall the {bridge} runtime? Client configuration entries will be preserved.",
  detectedAt: "Detected at {path} (version {version}).",
  missingAdobeApp: "{app} was not found in /Applications.",
  actionFailed: "The action could not be completed.",
  actionFailedRecovery:
    "Review diagnostics and try again. Reference code: {code}.",
  actionMessages: {
    DASHBOARD_UNAVAILABLE: [
      "The manager could not read local system status.",
      "Restart Adobe AI Bridge and reopen Diagnostics if this persists.",
    ],
    RUNTIME_INSTALL_FAILED: [
      "The runtime could not be installed.",
      "Review the runtime bundle and logs, then try again. The active version was not switched.",
    ],
    UXP_OPEN_FAILED: [
      "The UXP installer could not be opened.",
      "Rebuild the verified InDesign bundle, then retry from this application.",
    ],
    INDESIGN_PROXY_ACTION_FAILED: [
      "The InDesign proxy action failed.",
      "Review the proxy status and redacted log, then try again.",
    ],
    RUNTIME_ACTION_FAILED: [
      "The runtime action failed.",
      "Review diagnostics and try again. Unrelated engine files and client settings were preserved.",
    ],
    CONFIG_CONFLICT: [
      "A different server already uses this bridge name.",
      "The existing client entry was preserved.",
    ],
    CONFIG_PREVIEW_READY: [
      "Review the selected MCP entry before applying it.",
      "No client configuration has been changed yet.",
    ],
    CONFIG_PREVIEW_INSTALL_READY: [
      "Review the selected MCP entry before applying it.",
      "No client configuration has been changed yet.",
    ],
    CONFIG_PREVIEW_REMOVE_READY: [
      "Review the selected MCP entry removal before applying it.",
      "No client configuration has been changed yet.",
    ],
    CONFIG_ENTRY_ALREADY_PRESENT: [
      "This bridge entry is already present.",
      "No client configuration has been changed.",
    ],
    CONFIG_ENTRY_ALREADY_ABSENT: [
      "This bridge entry is already absent.",
      "No client configuration has been changed.",
    ],
    CONFIG_PREVIEW_FAILED: [
      "The client configuration could not be previewed.",
      "Check that the supported client configuration is readable and valid JSONC, then try again.",
    ],
    CONFIG_APPLY_FAILED: [
      "The client configuration was not changed.",
      "Preview the current file again and review any changes before applying.",
    ],
    HOME_UNAVAILABLE: [
      "The user home directory could not be resolved.",
      "Sign in to macOS and retry from your user account.",
    ],
    CONFIG_SYMLINK_REJECTED: [
      "The client configuration is a symbolic link and was not read.",
      "Move the config to the supported user path or replace the link yourself.",
    ],
    CONFIG_READ_FAILED: [
      "The client configuration could not be read.",
      "Check the file path and permissions, then try again.",
    ],
    LAUNCHER_NOT_INSTALLED: [
      "The Adobe AI Bridge launcher is not installed yet.",
      "Install at least one verified bridge runtime before applying a client configuration.",
    ],
    CONFIG_CHANGED: [
      "The client configuration changed after preview. No write was made.",
      "Preview the updated file again before applying the bridge entry.",
    ],
    CONFIG_INVALID: [
      "The existing client configuration is not valid JSONC.",
      "Fix the configuration syntax in the client, then preview again.",
    ],
    PREVIEW_INVALID: [
      "The proposed client configuration is not valid JSONC.",
      "Close the preview and generate it again.",
    ],
    ENTRY_MISMATCH: [
      "The proposed bridge entry does not match the manager-owned launcher configuration.",
      "Refresh the preview and apply the exact generated entry.",
    ],
    UNRELATED_CONFIG_CHANGE: [
      "The proposed edit changes settings outside the selected Adobe AI Bridge entry.",
      "Discard this preview and create a new preview from the current configuration.",
    ],
    CONFIG_APPLIED: [
      "The selected bridge entry was written with a backup.",
      "Restart or reload the client, then verify MCP initialize and tools/list there.",
    ],
    CONFIG_WRITE_FAILED: [
      "The client configuration could not be written safely.",
      "The previous file remains in place. Check directory permissions and try again.",
    ],
    CONFIG_ENTRY_ALREADY_REMOVED: [
      "The selected bridge entry is already absent.",
      "No client configuration was changed.",
    ],
    CONFIG_ENTRY_NOT_OWNED: [
      "The selected bridge entry is not owned by Adobe AI Bridge.",
      "The entry was preserved. Review it in the client before making changes.",
    ],
    CONFIG_ENTRY_REMAINS: [
      "The selected bridge entry remains in the client configuration.",
      "Review the current file and create a fresh removal preview.",
    ],
    CONFIG_ENTRY_REMOVED: [
      "The selected bridge entry was removed with a backup.",
      "Other client configuration entries were preserved.",
    ],
    RUNTIME_INSTALLED: [
      "The selected bridge runtime is installed.",
      "The previous version remains available for rollback.",
    ],
    RUNTIME_ROLLED_BACK: [
      "The selected bridge runtime was rolled back.",
      "The previously active version remains installed.",
    ],
    RUNTIME_ROLLBACK_FAILED: [
      "The runtime could not be rolled back.",
      "The currently active runtime was left in place.",
    ],
    INDESIGN_TOKEN_CLEANUP_FAILED: [
      "The proxy stopped, but the protected InDesign token could not be removed.",
      "Inspect the protected token file before retrying uninstall.",
    ],
    RUNTIME_UNINSTALL_FAILED: [
      "The bridge runtime could not be removed safely.",
      "Inspect its Adobe AI Bridge Application Support directory and try again.",
    ],
    SHARED_RUNTIME_CLEANUP_FAILED: [
      "Shared runtime files could not be cleaned up safely.",
      "Review the manager's Application Support directory before retrying.",
    ],
    SHARED_RUNTIME_OWNERSHIP_CONFLICT: [
      "The launcher path is not a regular manager-owned file and was left untouched.",
      "Inspect the launcher path before removing shared manager files.",
    ],
    RUNTIME_UNINSTALLED: [
      "The selected bridge runtime files were removed.",
      "Client configuration entries were preserved. Remove them separately with a configuration preview if desired.",
    ],
    INDESIGN_RUNTIME_NOT_INSTALLED: [
      "The InDesign runtime is not installed or its managed versions are missing.",
      "Install or reinstall the InDesign bridge runtime, then start the proxy again.",
    ],
    INDESIGN_RUNTIME_PATH_UNSAFE: [
      "The active InDesign runtime points outside its managed version directory.",
      "Reinstall the InDesign bridge runtime before starting the proxy.",
    ],
    INDESIGN_PROXY_BUNDLE_MISSING: [
      "The bundled Node runtime or InDesign proxy is missing.",
      "Reinstall the InDesign bridge runtime from the current manager build.",
    ],
    INDESIGN_PROXY_ALREADY_RUNNING: [
      "The InDesign proxy is already responding on 127.0.0.1:3001.",
      "Open the InDesign UXP panel and copy the connection token from the manager.",
    ],
    INDESIGN_PROXY_PORT_CONFLICT: [
      "Port 3001 is occupied by another local service. The manager did not stop or replace it.",
      "Close the other app yourself, then try again.",
    ],
    INDESIGN_PROXY_SETUP_FAILED: [
      "A private proxy directory could not be created.",
      "Check permissions under your macOS user account and try again.",
    ],
    INDESIGN_TOKEN_SETUP_FAILED: [
      "The local proxy token could not be prepared.",
      "Review the Adobe AI Bridge state directory permissions and try again.",
    ],
    INDESIGN_AGENT_OWNERSHIP_CONFLICT: [
      "A different LaunchAgent already uses the Adobe AI Bridge service path.",
      "Inspect or rename that file yourself. The manager will not replace an unrecognized service.",
    ],
    INDESIGN_AGENT_WRITE_FAILED: [
      "The user LaunchAgent could not be written.",
      "Check permissions in ~/Library/LaunchAgents and try again.",
    ],
    USER_SESSION_UNAVAILABLE: [
      "The current macOS user session could not be identified.",
      "Sign in to the desktop user session and try again.",
    ],
    INDESIGN_AGENT_START_FAILED: [
      "macOS could not start the InDesign proxy LaunchAgent.",
      "Open Diagnostics and check the InDesign proxy log. Other processes were not stopped.",
    ],
    INDESIGN_PROXY_STARTED: [
      "The authenticated proxy is responding on 127.0.0.1:3001.",
      "Open the InDesign UXP panel and enter the one-time token from the manager.",
    ],
    INDESIGN_PROXY_NOT_HEALTHY: [
      "The LaunchAgent started, but the InDesign proxy did not pass its health check.",
      "Review the redacted InDesign proxy log, correct the reported issue, and try again.",
    ],
    INDESIGN_AGENT_CLEANUP_FAILED: [
      "The InDesign proxy LaunchAgent could not be inspected or removed safely.",
      "Check permissions under ~/Library/LaunchAgents and review the proxy status.",
    ],
    INDESIGN_PROXY_OWNERSHIP_CONFLICT: [
      "Another service answers on port 3001 and is not owned by this manager.",
      "Inspect the running service yourself. The manager left it untouched.",
    ],
    INDESIGN_AGENT_STOP_FAILED: [
      "macOS could not stop the InDesign proxy LaunchAgent.",
      "Retry from the same macOS user account and inspect the proxy status.",
    ],
    INDESIGN_PROXY_STOPPED: [
      "The InDesign proxy LaunchAgent was stopped.",
      "MCP entries remain in each client until you remove them there.",
    ],
    INDESIGN_TOKEN_UNAVAILABLE: [
      "The InDesign connection token is unavailable.",
      "Start the InDesign proxy and try again.",
    ],
    CLIPBOARD_UNAVAILABLE: [
      "macOS could not copy the one-time UXP token.",
      "Try the copy action again after the desktop is ready.",
    ],
    INDESIGN_TOKEN_COPIED: [
      "A one-time local connection token was copied to the clipboard.",
      "Paste it into the Adobe AI Bridge panel in InDesign. The manager does not log or display the token.",
    ],
  } satisfies Record<string, [string, string]>,
} as const;

type Widen<T> = T extends string
  ? string
  : T extends readonly [unknown, unknown]
    ? readonly [Widen<T[0]>, Widen<T[1]>]
    : T extends readonly unknown[]
      ? readonly Widen<T[number]>[]
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T;

type Copy = Widen<typeof en>;

const zh: { [K in keyof Copy]: Copy[K] } = {
  homeLabel: "Adobe AI Bridge 主页",
  manager: "管理器",
  language: "界面语言",
  followSystem: "跟随系统",
  english: "English",
  simplifiedChinese: "简体中文",
  stateLabels: {
    not_installed: "未检测到",
    installed_not_running: "可配置",
    waiting_for_plugin: "等待插件连接",
    connected: "已连接",
    degraded: "待验证",
    error: "错误",
  },
  notVerified: "尚未验证",
  lastVerified: "上次验证",
  browserPreviewLabel: "浏览器预览",
  browserPreviewDetail: "请运行桌面应用以检查本机软件和连接状态。",
  previewOnly:
    "当前为浏览器预览模式。本机应用检测、安装和客户端配置请在桌面应用中进行。",
  localAdobeManager: "本机 ADOBE 连接管理器",
  pageTitle: "两个桥接服务，一个管理入口",
  pageIntro:
    "可分别安装两个引擎、连接两个 AI 客户端，并在使用文档工具前验证各层状态。",
  independentEngineStatus: "引擎独立状态",
  adobeApplications: "Adobe 应用",
  refreshDiagnostics: "刷新诊断信息",
  refresh: "刷新",
  vectorDesign: "矢量设计",
  pageLayout: "页面排版",
  runtime: "运行时",
  runtimeNotInstalled: "未安装运行时",
  installing: "正在安装…",
  updateRuntime: "更新运行时",
  installRuntime: "安装运行时",
  rollingBack: "正在回滚…",
  rollbackRuntime: "回滚运行时",
  uninstalling: "正在卸载…",
  uninstallRuntime: "卸载运行时",
  starting: "正在启动…",
  startProxy: "启动代理",
  stopping: "正在停止…",
  stopProxy: "停止代理",
  copyUxpToken: "复制 UXP 令牌",
  openUxpInstaller: "打开 UXP 安装器",
  adobeApplication: "Adobe 应用",
  managedRuntime: "托管运行时",
  loopbackProxy: "本机回环代理",
  clientProcess: "客户端进程",
  uxpPanel: "UXP 面板",
  automationPermission: "自动化权限",
  mcpReadCheck: "MCP 读取检查",
  fourConnections: "四个独立的 MCP 连接",
  clientHeading: "OpenCode 与腾讯 WorkBuddy",
  clientIntro: "每个客户端都会为每个 Adobe 应用配置独立的服务器条目。",
  aiClient: "AI 客户端",
  adobeBridge: "Adobe 桥接服务",
  illustratorMcp: "Illustrator MCP",
  indesignMcp: "InDesign MCP",
  preparingPreview: "正在准备预览…",
  previewInstall: "预览安装变更",
  previewRemoval: "预览移除变更",
  existingEntryPreserved: "现有条目与管理器创建的配置不同，已保留原条目。",
  noFileChanges: "无需修改文件。",
  selectedEntryAbsent: "所选桥接服务条目已不存在。",
  entryWillBeAdded: "仅添加所选 Adobe AI Bridge 条目，现有客户端设置会保留。",
  entryWillBeRemoved: "仅移除所选 Adobe AI Bridge 条目，并先备份当前文件。",
  applyingSafely: "正在安全应用…",
  applyEntry: "应用此条目",
  removeEntry: "移除此条目",
  noSchema: "未检测到配置格式",
  localManagerFooter: "本机管理器 · 诊断信息不包含文档内容",
  verificationFooter: "检查记录带有时间戳，并与真实应用验证结果区分开",
  uninstallConfirm: "确定卸载 {bridge} 运行时吗？客户端配置条目会保留。",
  detectedAt: "检测位置：{path}（版本 {version}）。",
  missingAdobeApp: "在 /Applications 中未找到 {app}。",
  actionFailed: "操作未能完成。",
  actionFailedRecovery: "请查看诊断信息后重试。参考代码：{code}。",
  actionMessages: {
    DASHBOARD_UNAVAILABLE: [
      "管理器无法读取本机系统状态。",
      "如果问题持续，请重启 Adobe AI Bridge 并重新打开诊断页面。",
    ],
    RUNTIME_INSTALL_FAILED: [
      "无法安装运行时。",
      "检查运行时包和日志后重试。当前启用的版本未切换。",
    ],
    UXP_OPEN_FAILED: [
      "无法打开 UXP 安装器。",
      "重新构建并验证 InDesign 安装包，然后在此应用中重试。",
    ],
    INDESIGN_PROXY_ACTION_FAILED: [
      "InDesign 代理操作失败。",
      "检查代理状态和脱敏日志后重试。",
    ],
    RUNTIME_ACTION_FAILED: [
      "运行时操作失败。",
      "查看诊断信息后重试。其他引擎文件和客户端设置已保留。",
    ],
    CONFIG_CONFLICT: [
      "已有其他服务器使用了此桥接服务名称。",
      "现有客户端条目已保留。",
    ],
    CONFIG_PREVIEW_READY: [
      "请检查所选 MCP 条目，再应用变更。",
      "尚未修改客户端配置。",
    ],
    CONFIG_PREVIEW_INSTALL_READY: [
      "请检查所选 MCP 条目，再应用安装变更。",
      "尚未修改客户端配置。",
    ],
    CONFIG_PREVIEW_REMOVE_READY: [
      "请检查所选 MCP 条目的移除变更。",
      "尚未修改客户端配置。",
    ],
    CONFIG_ENTRY_ALREADY_PRESENT: [
      "此桥接服务条目已存在。",
      "客户端配置未更改。",
    ],
    CONFIG_ENTRY_ALREADY_ABSENT: [
      "此桥接服务条目已不存在。",
      "客户端配置未更改。",
    ],
    CONFIG_PREVIEW_FAILED: [
      "无法预览客户端配置。",
      "检查受支持的客户端配置文件是否可读且符合 JSONC 格式，然后重试。",
    ],
    CONFIG_APPLY_FAILED: [
      "客户端配置未更改。",
      "重新预览当前文件，并在应用前检查其中的变更。",
    ],
    HOME_UNAVAILABLE: ["无法确定用户主目录。", "登录 macOS 用户账户后重试。"],
    CONFIG_SYMLINK_REJECTED: [
      "客户端配置是符号链接，因此未读取。",
      "请将配置文件移至受支持的用户目录，或自行替换此链接。",
    ],
    CONFIG_READ_FAILED: ["无法读取客户端配置。", "检查文件路径和权限后重试。"],
    LAUNCHER_NOT_INSTALLED: [
      "尚未安装 Adobe AI Bridge 启动器。",
      "至少安装一个已验证的桥接运行时后，再应用客户端配置。",
    ],
    CONFIG_CHANGED: [
      "预览后客户端配置发生了变化，未写入任何内容。",
      "重新预览更新后的文件，再应用桥接服务条目。",
    ],
    CONFIG_INVALID: [
      "现有客户端配置不是有效的 JSONC。",
      "在客户端中修复配置语法，然后重新预览。",
    ],
    PREVIEW_INVALID: [
      "建议的客户端配置不是有效的 JSONC。",
      "关闭预览并重新生成。",
    ],
    ENTRY_MISMATCH: [
      "建议的桥接服务条目与管理器启动器配置不一致。",
      "刷新预览并应用准确生成的条目。",
    ],
    UNRELATED_CONFIG_CHANGE: [
      "建议的修改影响了所选 Adobe AI Bridge 条目以外的设置。",
      "放弃此预览，并根据当前配置重新生成预览。",
    ],
    CONFIG_APPLIED: [
      "所选桥接服务条目已写入，并已创建备份。",
      "重启或重新加载客户端，然后在其中验证 MCP initialize 和 tools/list。",
    ],
    CONFIG_WRITE_FAILED: [
      "无法安全写入客户端配置。",
      "原文件已保留。检查目录权限后重试。",
    ],
    CONFIG_ENTRY_ALREADY_REMOVED: [
      "所选桥接服务条目已不存在。",
      "客户端配置未更改。",
    ],
    CONFIG_ENTRY_NOT_OWNED: [
      "所选桥接服务条目并非由 Adobe AI Bridge 管理。",
      "条目已保留。请先在客户端中检查，再决定是否修改。",
    ],
    CONFIG_ENTRY_REMAINS: [
      "所选桥接服务条目仍在客户端配置中。",
      "检查当前文件并重新创建移除预览。",
    ],
    CONFIG_ENTRY_REMOVED: [
      "所选桥接服务条目已移除，并已创建备份。",
      "其他客户端配置条目已保留。",
    ],
    RUNTIME_INSTALLED: ["所选桥接运行时已安装。", "之前的版本仍可用于回滚。"],
    RUNTIME_ROLLED_BACK: [
      "所选桥接运行时已回滚。",
      "此前启用的版本仍保留在本机。",
    ],
    RUNTIME_ROLLBACK_FAILED: ["无法回滚运行时。", "当前启用的运行时保持不变。"],
    INDESIGN_TOKEN_CLEANUP_FAILED: [
      "代理已停止，但无法移除受保护的 InDesign 令牌。",
      "检查受保护的令牌文件后再重试卸载。",
    ],
    RUNTIME_UNINSTALL_FAILED: [
      "无法安全移除桥接运行时。",
      "检查 Adobe AI Bridge 的应用程序支持目录后重试。",
    ],
    SHARED_RUNTIME_CLEANUP_FAILED: [
      "无法安全清理共享运行时文件。",
      "检查管理器的应用程序支持目录后重试。",
    ],
    SHARED_RUNTIME_OWNERSHIP_CONFLICT: [
      "启动器路径不是管理器拥有的常规文件，因此未修改。",
      "移除共享管理器文件前，请检查启动器路径。",
    ],
    RUNTIME_UNINSTALLED: [
      "所选桥接服务的运行时文件已移除。",
      "客户端配置条目已保留。如需移除，请另行创建配置预览。",
    ],
    INDESIGN_RUNTIME_NOT_INSTALLED: [
      "InDesign 运行时未安装，或其托管版本文件缺失。",
      "安装或重新安装 InDesign 桥接运行时，然后重新启动代理。",
    ],
    INDESIGN_RUNTIME_PATH_UNSAFE: [
      "当前 InDesign 运行时指向托管版本目录之外。",
      "启动代理前请重新安装 InDesign 桥接运行时。",
    ],
    INDESIGN_PROXY_BUNDLE_MISSING: [
      "打包的 Node 运行时或 InDesign 代理缺失。",
      "使用当前管理器版本重新安装 InDesign 桥接运行时。",
    ],
    INDESIGN_PROXY_ALREADY_RUNNING: [
      "InDesign 代理已在 127.0.0.1:3001 响应。",
      "打开 InDesign UXP 面板，并从管理器复制连接令牌。",
    ],
    INDESIGN_PROXY_PORT_CONFLICT: [
      "端口 3001 已被其他本机服务占用。管理器没有停止或替换该服务。",
      "请自行关闭其他应用，然后重试。",
    ],
    INDESIGN_PROXY_SETUP_FAILED: [
      "无法创建代理所需的私有目录。",
      "检查 macOS 用户账户下的权限后重试。",
    ],
    INDESIGN_TOKEN_SETUP_FAILED: [
      "无法准备本机代理令牌。",
      "检查 Adobe AI Bridge 状态目录的权限后重试。",
    ],
    INDESIGN_AGENT_OWNERSHIP_CONFLICT: [
      "另一个 LaunchAgent 已使用 Adobe AI Bridge 服务路径。",
      "请自行检查或重命名该文件。管理器不会替换无法识别的服务。",
    ],
    INDESIGN_AGENT_WRITE_FAILED: [
      "无法写入用户 LaunchAgent。",
      "检查 ~/Library/LaunchAgents 的权限后重试。",
    ],
    USER_SESSION_UNAVAILABLE: [
      "无法识别当前 macOS 用户会话。",
      "登录桌面用户会话后重试。",
    ],
    INDESIGN_AGENT_START_FAILED: [
      "macOS 无法启动 InDesign 代理 LaunchAgent。",
      "打开诊断页面并检查 InDesign 代理日志。管理器没有停止其他进程。",
    ],
    INDESIGN_PROXY_STARTED: [
      "已认证代理正在 127.0.0.1:3001 响应。",
      "打开 InDesign UXP 面板，并输入管理器提供的一次性令牌。",
    ],
    INDESIGN_PROXY_NOT_HEALTHY: [
      "LaunchAgent 已启动，但 InDesign 代理未通过健康检查。",
      "查看脱敏后的 InDesign 代理日志，解决其中报告的问题后重试。",
    ],
    INDESIGN_AGENT_CLEANUP_FAILED: [
      "无法安全检查或移除 InDesign 代理 LaunchAgent。",
      "检查 ~/Library/LaunchAgents 的权限和代理状态。",
    ],
    INDESIGN_PROXY_OWNERSHIP_CONFLICT: [
      "端口 3001 上有其他服务响应，且该服务不归此管理器所有。",
      "请自行检查该服务。管理器未修改它。",
    ],
    INDESIGN_AGENT_STOP_FAILED: [
      "macOS 无法停止 InDesign 代理 LaunchAgent。",
      "使用同一个 macOS 用户账户重试，并检查代理状态。",
    ],
    INDESIGN_PROXY_STOPPED: [
      "InDesign 代理 LaunchAgent 已停止。",
      "各客户端中的 MCP 条目会保留，直到你在客户端中移除。",
    ],
    INDESIGN_TOKEN_UNAVAILABLE: [
      "InDesign 连接令牌不可用。",
      "启动 InDesign 代理后重试。",
    ],
    CLIPBOARD_UNAVAILABLE: [
      "macOS 无法复制一次性 UXP 令牌。",
      "桌面环境就绪后重试复制。",
    ],
    INDESIGN_TOKEN_COPIED: [
      "一次性本机连接令牌已复制到剪贴板。",
      "将它粘贴到 InDesign 中的 Adobe AI Bridge 面板。管理器不会记录或显示该令牌。",
    ],
  },
};

export type UiStrings = Copy;

export const strings: Record<Locale, UiStrings> = { en, "zh-CN": zh };

const preferenceStorageKey = "adobe-ai-bridge.language";

export function detectSystemLocale(): Locale {
  const language =
    typeof navigator === "undefined"
      ? "en"
      : (navigator.languages?.[0] ?? navigator.language ?? "en");
  return /^zh(?:-|$)/i.test(language) ? "zh-CN" : "en";
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

export function localizeLayerDetail(
  detail: string,
  locale: Locale,
  bridge?: BridgeId,
): string {
  if (locale === "en") return detail;
  const known: Record<string, string> = {
    "Run the desktop application to inspect local software and connections.":
      "请运行桌面应用以检查本机软件和连接状态。",
    "Manager is running locally.": "管理器正在本机运行。",
    "A managed runtime is installed.": "已安装托管运行时。",
    "The installed runtime manifest is missing or invalid.":
      "已安装运行时的清单缺失或无效。",
    "The managed runtime has not been installed.": "尚未安装托管运行时。",
    "One authenticated InDesign UXP panel is connected.":
      "一个已认证的 InDesign UXP 面板已连接。",
    "Start Adobe AI Bridge in the InDesign UXP panel and enter its one-time token.":
      "在 InDesign UXP 面板中启动 Adobe AI Bridge，并输入一次性令牌。",
    "The loopback InDesign proxy answered its health check.":
      "InDesign 本机回环代理已通过健康检查。",
    "A previous document operation has an unknown outcome; inspect the document before recovery.":
      "先前的文档操作结果未知；恢复前请检查文档。",
    "Proxy health is verified; MCP initialize and document read have not been run from this manager.":
      "代理健康状态已验证；此管理器尚未运行 MCP initialize 和文档读取。",
    "The InDesign proxy is not answering on 127.0.0.1:3001.":
      "InDesign 代理未在 127.0.0.1:3001 响应。",
    "The UXP connection has not been verified.": "UXP 连接尚未验证。",
    "MCP initialize and document read have not been verified.":
      "MCP initialize 和文档读取尚未验证。",
    "Illustrator MCP servers are started by OpenCode or WorkBuddy on demand.":
      "Illustrator MCP 服务由 OpenCode 或 WorkBuddy 按需启动。",
    "macOS Automation permission has not been checked by a real Illustrator read.":
      "尚未通过真实 Illustrator 文档读取检查 macOS 自动化权限。",
    "MCP initialize and document read have not been verified from the manager.":
      "管理器尚未验证 MCP initialize 和文档读取。",
    "Configuration file detected; server registration has not been verified.":
      "已检测到配置文件；尚未验证服务器注册状态。",
    "The configuration file could not be read.": "无法读取配置文件。",
    "No supported OpenCode user configuration file was found.":
      "未找到受支持的 OpenCode 用户配置文件。",
    "Configuration file detected; installed WorkBuddy schema has not been live-tested.":
      "已检测到配置文件；尚未通过实际运行验证 WorkBuddy 配置格式。",
    "No supported WorkBuddy user configuration file was found.":
      "未找到受支持的 WorkBuddy 用户配置文件。",
  };
  const translated = known[detail];
  if (translated) return translated;
  const detected = /^Detected at (.+) \(version (.+)\)\.$/.exec(detail);
  if (detected?.[1] && detected[2]) {
    return formatTemplate(strings["zh-CN"].detectedAt, {
      path: detected[1],
      version: detected[2],
    });
  }
  const app = bridge === "illustrator" ? "Adobe Illustrator" : "Adobe InDesign";
  if (bridge && detail === `${app} was not found in /Applications.`) {
    return formatTemplate(strings["zh-CN"].missingAdobeApp, { app });
  }
  return detail;
}

export function localizeActionResult<
  T extends { code: string; message: string; recovery: string },
>(result: T, locale: Locale, copy: UiStrings): T {
  if (locale === "en") return result;
  const translated =
    copy.actionMessages[result.code as keyof UiStrings["actionMessages"]];
  const message = translated?.[0] ?? copy.actionFailed;
  const recovery =
    translated?.[1] ?? copy.actionFailedRecovery.replace("{code}", result.code);
  return { ...result, message, recovery };
}

export function localizedClientDetail(
  detail: string,
  locale: Locale,
  client: ClientId,
): string {
  if (locale === "en") return detail;
  const shared: Record<string, string> = {
    "Run the desktop application to inspect local software and connections.":
      "请运行桌面应用以检查本机软件和连接状态。",
    "The configuration file could not be read.": "无法读取配置文件。",
  };
  const sharedTranslation = shared[detail];
  if (sharedTranslation) return sharedTranslation;
  if (client === "opencode") {
    return (
      {
        "Configuration file detected; server registration has not been verified.":
          "已检测到配置文件；尚未验证服务器注册状态。",
        "No supported OpenCode user configuration file was found.":
          "未找到受支持的 OpenCode 用户配置文件。",
      }[detail] ?? detail
    );
  }
  return (
    {
      "Configuration file detected; installed WorkBuddy schema has not been live-tested.":
        "已检测到配置文件；尚未通过实际运行验证 WorkBuddy 配置格式。",
      "No supported WorkBuddy user configuration file was found.":
        "未找到受支持的 WorkBuddy 用户配置文件。",
    }[detail] ?? detail
  );
}

export function formatTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
