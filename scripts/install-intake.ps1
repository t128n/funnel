<#
.SYNOPSIS
  Installs (or removes) the Funnel intake hotkey helper for the current user.

.DESCRIPTION
  Copies the native `funnel-intake.exe` into %LOCALAPPDATA%\Funnel\Intake,
  writes its JSON config, and registers a Startup shortcut. The binary owns the
  global hotkey itself, so the shortcut carries no "Shortcut key".

  The installer also removes the legacy `Funnel Intake.lnk` hotkey shortcut that
  the old PowerShell helper left in the Start Menu; otherwise Windows would
  refuse to register the same combo.

.EXAMPLE
  # build first, then install with the defaults
  mise run intake:exe
  powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1

.EXAMPLE
  # point at a different instance and hotkey
  powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1 `
    -Url https://funnel.example.com -Hotkey "Ctrl+Shift+I"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string]$Url = "http://localhost:3000",
  [string]$Hotkey = "Ctrl+Alt+I",
  [string]$Source = "",
  [string]$ExePath,
  [switch]$Uninstall,
  [switch]$NoStart,
  [switch]$KeepConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "Funnel\Intake"
$configPath = Join-Path $installDir "config.json"
$logPath = Join-Path $installDir "intake.log"
$installedExe = Join-Path $installDir "funnel-intake.exe"

$startupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Funnel Intake.lnk"
$legacyShortcuts = @(
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Funnel Intake.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "Funnel Intake.lnk")
)

function Stop-Intake {
  Get-Process -Name "funnel-intake" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Remove-LegacyShortcuts {
  foreach ($shortcut in $legacyShortcuts) {
    if (Test-Path -LiteralPath $shortcut) {
      Remove-Item -LiteralPath $shortcut -Force
      Write-Host "Removed legacy shortcut: $shortcut"
    }
  }
}

if ($Uninstall) {
  Stop-Intake
  if (Test-Path -LiteralPath $startupShortcut) {
    Remove-Item -LiteralPath $startupShortcut -Force
    Write-Host "Removed startup shortcut: $startupShortcut"
  }
  Remove-LegacyShortcuts

  if (-not $KeepConfig -and (Test-Path -LiteralPath $installDir)) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
    Write-Host "Removed install directory: $installDir"
  } elseif ($KeepConfig) {
    Write-Host "Kept install directory (config + logs): $installDir"
  }
  exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ExePath) {
  $ExePath = Join-Path $repoRoot "dist\funnel-intake.exe"
}
if (-not (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
  throw "Cannot find $ExePath. Build it first with 'mise run intake:exe'."
}

Stop-Intake
Remove-LegacyShortcuts

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -LiteralPath $ExePath -Destination $installedExe -Force

# Preserve a custom sourceMap (or any future keys) when rewriting the config.
$config = @{}
if (Test-Path -LiteralPath $configPath) {
  try {
    $existing = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    foreach ($property in $existing.PSObject.Properties) {
      $config[$property.Name] = $property.Value
    }
  } catch {
    Write-Warning "Could not read the existing config; writing a fresh one: $($_.Exception.Message)"
  }
}
$config["url"] = $Url
$config["hotkey"] = $Hotkey
if ([string]::IsNullOrWhiteSpace($Source)) {
  [void]$config.Remove("source")
} else {
  $config["source"] = $Source
}

$json = $config | ConvertTo-Json -Depth 6
# Windows PowerShell's -Encoding UTF8 writes a BOM; Go's JSON decoder rejects
# it, so write UTF-8 without one.
[System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($startupShortcut)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = "Funnel intake hotkey helper"
$shortcut.Save()

if (-not $NoStart) {
  Start-Process -FilePath $installedExe -WorkingDirectory $installDir | Out-Null
  Start-Sleep -Milliseconds 1200

  $process = Get-Process -Name "funnel-intake" -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-Warning "funnel-intake did not stay running. Check $logPath."
  } elseif (Test-Path -LiteralPath $logPath) {
    $tail = Get-Content -LiteralPath $logPath -Tail 5 -ErrorAction SilentlyContinue
    if ($tail -match "fatal") {
      Write-Warning "The helper reported a fatal error:`n$($tail -join "`n")"
    }
  }
}

Write-Host ""
Write-Host "Installed Funnel Intake"
Write-Host "  Exe    : $installedExe"
Write-Host "  Config : $configPath"
Write-Host "  Log    : $logPath"
Write-Host "  Hotkey : $Hotkey"
Write-Host "  URL    : $Url"
Write-Host ""
Write-Host "Select text in Teams/Outlook and press $Hotkey."
Write-Host "Remove it again with: powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1 -Uninstall"
