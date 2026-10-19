<#
.SYNOPSIS
  Remove the Funnel Windows service.

.DESCRIPTION
  Stops and unregisters the WinSW-hosted Funnel service. By default the install
  directory and the data directory (the database and uploads) are left in
  place; pass -RemoveFiles / -RemoveData to delete them, which is destructive.

  Run from an elevated PowerShell prompt.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File uninstall-service.ps1
#>
[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:ProgramData "Funnel"),
  [string]$DataDir,
  [string]$FirewallRuleName = "Funnel",
  [switch]$RemoveFiles,
  [switch]$RemoveData
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "This script must be run from an elevated (Administrator) PowerShell prompt."
  }
}

Assert-Administrator
if (-not $DataDir) { $DataDir = $InstallDir }

$serviceExe = Join-Path $InstallDir "funnel-service.exe"
if (Test-Path -LiteralPath $serviceExe -PathType Leaf) {
  Push-Location $InstallDir
  try {
    & $serviceExe stop 2>$null | Out-Null
    & $serviceExe uninstall
  } finally {
    Pop-Location
  }
  Write-Host "Service stopped and unregistered."
} else {
  Write-Warning "WinSW host not found at '$serviceExe'; attempting sc.exe delete."
  & sc.exe delete funnel 2>$null | Out-Null
}

Get-NetFirewallRule -DisplayName "$FirewallRuleName*" -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-NetFirewallRule -DisplayName $_.DisplayName; Write-Host "Removed firewall rule: $($_.DisplayName)" }

if ($RemoveFiles) {
  Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Removed install directory: $InstallDir"
}

if ($RemoveData) {
  if ((Resolve-Path -LiteralPath $DataDir -ErrorAction SilentlyContinue).Path -ne $InstallDir) {
    Remove-Item -LiteralPath $DataDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Warning "Removed data directory: $DataDir (database and uploads are gone)"
}
