# install.ps1 - one-line installer for the InDesign MCP (Windows)
#
#   irm https://raw.githubusercontent.com/Rinellasky/indesign-mcp/main/install/install.ps1 | iex
#
# What it does (idempotent, backs up before changing anything):
#   1. Verifies/install-hints prerequisites: uv, Claude Desktop
#   2. Downloads the latest release artifacts (MCP server bundle + proxy + plugin)
#      - every expected asset missing is a LOUD ERROR, never a silent skip (issue #2)
#   3. Adds the `indesign-mcp` server to claude_desktop_config.json (backup made)
#   4. Installs the .ccx UXP plugin via Adobe's installer (UPIA) and VERIFIES the
#      install actually registered (issue #1 was a silent double-click no-op)
#   5. Prints the two manual steps that can't be automated
#
# Nothing here touches InDesign settings or existing MCP servers.

$ErrorActionPreference = "Stop"
$Repo = "Rinellasky/indesign-mcp"
$InstallDir = Join-Path $env:LOCALAPPDATA "indesign-mcp"

Write-Host "=== InDesign MCP installer ===" -ForegroundColor Cyan

# -- 1. prerequisites ---------------------------------------------------------
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "uv not found - installing via winget..." -ForegroundColor Yellow
    winget install --id=astral-sh.uv -e --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw "uv still not found after install - open a new terminal and re-run."
    }
}
$claudeConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
if (-not (Test-Path (Split-Path $claudeConfig))) {
    throw "Claude Desktop does not appear to be installed (no $((Split-Path $claudeConfig))). Install it from https://claude.ai/download first."
}

# -- 2. download release artifacts --------------------------------------------
Write-Host "Fetching latest release info..."
$release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
Write-Host "Release: $($release.tag_name)"
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

function Get-RequiredAsset($release, $name) {
    # Loud error on missing assets — a silent skip here ships a broken install
    # (see github.com/Rinellasky/indesign-mcp/issues)
    $asset = $release.assets | Where-Object { $_.name -eq $name }
    if (-not $asset) {
        throw ("Release $($release.tag_name) is missing required asset '$name'. " +
               "This is a release packaging bug - please report it at " +
               "https://github.com/$Repo/issues with this message.")
    }
    return $asset
}

# MCP server bundle (.dxt is a zip containing the server + manifest)
$dxtAsset = Get-RequiredAsset $release "indesign-mcp.dxt"
$dxtZip = Join-Path $env:TEMP "indesign-mcp-dxt.zip"
Invoke-WebRequest $dxtAsset.browser_download_url -OutFile $dxtZip
$serverDir = Join-Path $InstallDir "server"
if (Test-Path $serverDir) { Remove-Item $serverDir -Recurse -Force }
Expand-Archive $dxtZip -DestinationPath $serverDir
Remove-Item $dxtZip -Force
Write-Host "MCP server extracted to $serverDir"

# Proxy
$proxyAsset = Get-RequiredAsset $release "adb-proxy-socket-win-x64.exe"
Invoke-WebRequest $proxyAsset.browser_download_url -OutFile (Join-Path $InstallDir "adb-proxy-socket-win-x64.exe")
Write-Host "Proxy downloaded."

# -- 3. register the MCP server ----------------------------------------------
Write-Host "Registering indesign-mcp in Claude Desktop config..."
if (Test-Path $claudeConfig) {
    Copy-Item $claudeConfig "$claudeConfig.bak-indesign-mcp" -Force
    $cfg = Get-Content $claudeConfig -Raw | ConvertFrom-Json
} else {
    $cfg = [PSCustomObject]@{}
}
if (-not $cfg.PSObject.Properties["mcpServers"]) {
    $cfg | Add-Member -MemberType NoteProperty -Name mcpServers -Value ([PSCustomObject]@{})
}
$entry = [PSCustomObject]@{
    command = "uv"
    args = @("run",
             "--with", "fonttools", "--with", "mcp", "--with", "mcp[cli]",
             "--with", "python-socketio", "--with", "requests",
             "--with", "numpy", "--with", "pillow", "--with", "websocket-client",
             "mcp", "run", (Join-Path $serverDir "id-mcp.py"))
}
$cfg.mcpServers | Add-Member -MemberType NoteProperty -Name "indesign-mcp" -Value $entry -Force
$cfg | ConvertTo-Json -Depth 10 | Set-Content $claudeConfig -Encoding UTF8

# -- 4. UXP plugin (install + VERIFY) -----------------------------------------
$ccxAsset = Get-RequiredAsset $release "indesign-mcp-plugin.ccx"
$ccx = Join-Path $InstallDir "indesign-mcp-plugin.ccx"
Invoke-WebRequest $ccxAsset.browser_download_url -OutFile $ccx

$pluginVerified = $false
$upia = "C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"
if (Test-Path $upia) {
    Write-Host "Installing UXP plugin via Adobe's installer (UPIA)..."
    $out = & $upia /install $ccx 2>&1 | Out-String
    if ($out -match "Installation Successful") {
        $pluginVerified = $true
        Write-Host "Plugin installed and verified." -ForegroundColor Green
    } else {
        # UPIA registers by display name; -160/-167 style codes mean an older
        # copy may exist - listing tells the truth either way
        $list = & $upia /list all 2>&1 | Out-String
        if ($list -match "InDesign MCP Agent") {
            $pluginVerified = $true
            Write-Host "Plugin already installed (verified via UPIA list)." -ForegroundColor Green
        } else {
            Write-Host "UPIA output: $out" -ForegroundColor Red
            throw ("UXP plugin install FAILED (UPIA did not report success and the plugin " +
                   "is not registered). Do not proceed - the panel will not exist in InDesign. " +
                   "Report this at https://github.com/$Repo/issues with the UPIA output above.")
        }
    }
} else {
    Write-Host "UPIA not found - falling back to opening the .ccx (Creative Cloud handles it)..." -ForegroundColor Yellow
    Start-Process $ccx
    Write-Host "IMPORTANT: verify the install yourself - after it completes, restart InDesign" -ForegroundColor Yellow
    Write-Host "and confirm 'InDesign MCP Agent' appears under the Plugins menu." -ForegroundColor Yellow
    Write-Host "If double-clicking appeared to do NOTHING, the install FAILED - report it." -ForegroundColor Yellow
}

# -- 5. done ------------------------------------------------------------------
Write-Host ""
Write-Host "=== Installed. Two manual steps remain ===" -ForegroundColor Green
Write-Host "1. Start the proxy:  $InstallDir\adb-proxy-socket-win-x64.exe"
Write-Host "   (keep it running; it bridges Claude <-> InDesign on localhost:3001)"
Write-Host "2. In InDesign (restart it if it was open): Plugins menu > 'InDesign MCP Agent' panel > Connect."
Write-Host ""
Write-Host "Then restart Claude Desktop - the indesign-mcp tools will appear."
Write-Host "Health check: ask Claude to run get_active_document_settings."
if (-not $pluginVerified) {
    Write-Host ""
    Write-Host "NOTE: plugin install was NOT machine-verified (no UPIA) - do the manual check above." -ForegroundColor Yellow
}
