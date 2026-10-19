<#
.SYNOPSIS
  Install Funnel as a Windows service (WinSW wrapper).

.DESCRIPTION
  Copies the standalone `funnel.exe` and a WinSW host into an install
  directory, writes the WinSW service definition, opens the firewall, generates
  a starter `.env`, and registers + starts the service.

  Run from an elevated PowerShell prompt. The service runs as LocalSystem by
  default and keeps all state under `-DataDir` (default C:\ProgramData\Funnel),
  so replacing the executable never touches the database or uploads.

.EXAMPLE
  # From a built repo (dist\funnel.exe):
  powershell -ExecutionPolicy Bypass -File packaging\windows\install-service.ps1

.EXAMPLE
  # From a release folder containing funnel.exe:
  powershell -ExecutionPolicy Bypass -File install-service.ps1 -ExePath .\funnel.exe
#>
[CmdletBinding()]
param(
  [string]$ExePath,
  [string]$InstallDir = (Join-Path $env:ProgramData "Funnel"),
  [string]$DataDir,
  [int]$Port = 3000,
  [string]$LogLevel = "info",
  [string]$WinSwPath,
  [string]$WinSwVersion = "2.12.0",
  [switch]$SkipFirewall,
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "This script must be run from an elevated (Administrator) PowerShell prompt."
  }
}

function Resolve-ExePath {
  param([string]$Candidate)
  $tries = @()
  if ($Candidate) { $tries += $Candidate }
  $tries += (Join-Path $PSScriptRoot "funnel.exe")
  $tries += (Join-Path $PSScriptRoot "..\..\dist\funnel.exe")
  foreach ($t in $tries) {
    if ($t -and (Test-Path -LiteralPath $t -PathType Leaf)) {
      return (Resolve-Path -LiteralPath $t).Path
    }
  }
  throw "funnel.exe not found. Pass -ExePath, or build it with 'mise run exe' (writes dist\funnel.exe)."
}

function Get-OrDownloadWinSw {
  param([string]$Candidate, [string]$Version, [string]$Target)
  if ($Candidate) {
    if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
      throw "WinSW executable not found at '$Candidate'."
    }
    return (Resolve-Path -LiteralPath $Candidate).Path
  }
  if (Test-Path -LiteralPath $Target -PathType Leaf) { return $Target }

  $url = "https://github.com/winsw/winsw/releases/download/v$Version/WinSW-x64.exe"
  Write-Host "Downloading WinSW $Version from $url"
  Invoke-WebRequest -Uri $url -OutFile $Target -UseBasicParsing
  return $Target
}

function New-FunnelSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes)
}

Assert-Administrator

if (-not $DataDir) { $DataDir = $InstallDir }

$resolvedExe = Resolve-ExePath $ExePath
New-Item -ItemType Directory -Force -Path $InstallDir, $DataDir | Out-Null

# WinSW requires <exe base name>.xml next to the host executable.
$serviceExe = Join-Path $InstallDir "funnel-service.exe"
$serviceXml = Join-Path $InstallDir "funnel-service.xml"
$installedExe = Join-Path $InstallDir "funnel.exe"

$winsw = Get-OrDownloadWinSw -Candidate $WinSwPath -Version $WinSwVersion -Target $serviceExe

if ((Resolve-Path -LiteralPath $resolvedExe).Path -ne $installedExe) {
  Copy-Item -LiteralPath $resolvedExe -Destination $installedExe -Force
}

# --- service definition ----------------------------------------------------
if (-not (Test-Path -LiteralPath $serviceXml)) {
  $template = Join-Path $PSScriptRoot "funnel-service.xml"
  if (-not (Test-Path -LiteralPath $template -PathType Leaf)) {
    throw "funnel-service.xml template not found next to this script."
  }
  $xml = Get-Content -LiteralPath $template -Raw
  $xml = $xml.Replace("%%EXE_PATH%%", $installedExe)
  $xml = $xml.Replace("%%DATA_DIR%%", $DataDir)
  $xml = $xml.Replace("%%PORT%%", "$Port")
  $xml = $xml.Replace("%%LOG_LEVEL%%", $LogLevel)
  Set-Content -LiteralPath $serviceXml -Value $xml -Encoding UTF8
  Write-Host "Wrote service definition: $serviceXml"
} else {
  Write-Host "Keeping existing service definition: $serviceXml"
}

# --- starter .env ----------------------------------------------------------
$envFile = Join-Path $DataDir ".env"
if (-not (Test-Path -LiteralPath $envFile)) {
  $secret = New-FunnelSecret
  @(
    "# Funnel configuration. Read on start; restart the service after edits.",
    "# Public URL (set this when behind a reverse proxy, e.g. https://funnel.example.com)",
    "FUNNEL_URL=",
    "",
    "# Encryption secret (generated). Do not change once in use.",
    "FUNNEL_SECRET=$secret",
    "",
    "# Optional one-time token gating the first-run /onboarding wizard.",
    "# FUNNEL_ONBOARDING_TOKEN=",
    "",
    "# GitHub Enterprise Server only:",
    "# GITHUB_URL=https://acme.ghe.com",
    "# GITHUB_API_URL=https://acme.ghe.com/api/v3"
  ) | Set-Content -LiteralPath $envFile -Encoding UTF8
  Write-Host "Wrote starter configuration: $envFile (edit FUNNEL_URL before first use)"
} else {
  Write-Host "Keeping existing configuration: $envFile"
}

# --- firewall --------------------------------------------------------------
if (-not $SkipFirewall) {
  $ruleName = "Funnel (TCP $Port)"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP `
      -LocalPort $Port -Action Allow -Profile Any | Out-Null
    Write-Host "Added firewall rule: $ruleName"
  }
}

# --- register + start ------------------------------------------------------
Push-Location $InstallDir
try {
  & $winsw stop 2>$null | Out-Null
  & $winsw uninstall 2>$null | Out-Null
  & $winsw install
  if ($LASTEXITCODE -ne 0) { throw "WinSW install failed (exit $LASTEXITCODE)." }

  if (-not $NoStart) {
    & $winsw start
    if ($LASTEXITCODE -ne 0) { throw "WinSW start failed (exit $LASTEXITCODE)." }
    Write-Host "Funnel service started."
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Installed. Next steps:"
Write-Host "  1. Edit $envFile (at minimum set FUNNEL_URL)."
Write-Host "  2. Restart the service:  cd `"$InstallDir`"; .\funnel-service.exe restart"
Write-Host "  3. Open the instance and finish onboarding: http://<host>:$Port/"
Write-Host "  4. Health probes: /healthz (liveness), /readyz (readiness)"
