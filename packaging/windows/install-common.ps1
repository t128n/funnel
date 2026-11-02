<#
  Shared helpers for the Windows installer and the WinForms setup wizard.

  Dot-source this file from install-service.ps1 and setup.ps1. It deliberately
  uses only Windows PowerShell 5.1-compatible syntax so the release can run on
  a stock Windows 10/11 machine without installing PowerShell 7.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Dot-sourced scripts do not reliably expose their own $PSScriptRoot inside
# functions, so pin the directory once here.
$script:FunnelInstallRoot = if ($PSScriptRoot) {
  $PSScriptRoot
} else {
  (Get-Location).Path
}

function Get-FunnelSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

function Find-FunnelEnvTemplate {
  [CmdletBinding()]
  param(
    [string]$Candidate = ""
  )

  $tries = New-Object System.Collections.Generic.List[string]
  if ($Candidate) { $tries.Add($Candidate) }

  # Release archive: setup scripts and .env.example sit side by side.
  $tries.Add((Join-Path $script:FunnelInstallRoot ".env.example"))

  # Source checkout: packaging/windows -> packaging -> repository root.
  $parent = Split-Path -Parent $script:FunnelInstallRoot
  if ($parent) {
    $tries.Add((Join-Path $parent ".env.example"))
    $grandparent = Split-Path -Parent $parent
    if ($grandparent) {
      $tries.Add((Join-Path $grandparent ".env.example"))
    }
  }

  foreach ($path in $tries) {
    if ($path -and (Test-Path -LiteralPath $path -PathType Leaf)) {
      return (Resolve-Path -LiteralPath $path).Path
    }
  }
  return $null
}

function Get-FunnelEnvValue {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }

  $pattern = "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$"
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match $pattern) {
      $value = $Matches[1].Trim()
      if ($value.Length -ge 2) {
        $first = $value.Substring(0, 1)
        $last = $value.Substring($value.Length - 1, 1)
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
          $value = $value.Substring(1, $value.Length - 2)
        }
      }
      return $value
    }
  }
  return $null
}

function Format-FunnelEnvValue {
  [CmdletBinding()]
  param(
    [AllowNull()][string]$Value
  )

  if ($null -eq $Value) { return "" }
  if ($Value -match '[\s#"'']') {
    # Do not double backslashes: Bun's .env parser keeps a Windows path's
    # single backslashes literally inside a quoted value.
    $escaped = $Value.Replace('"', '\"')
    return '"' + $escaped + '"'
  }
  return $Value
}

<#
  Write (or refresh) the .env file from .env.example.

  Existing values are preserved when -Force is not set. When -Force is set, the
  old file is backed up first. FUNNEL_SECRET is preserved from an existing file
  unless -NewSecret is explicitly requested: changing it after onboarding makes
  the encrypted GitHub App credentials unreadable.
#>
function Write-FunnelEnvFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$TemplatePath,
    [Parameter(Mandatory = $true)][string]$Secret,
    [string]$PublicUrl = "",
    [string]$OnboardingToken = "",
    [string]$LogLevel = "info",
    [string]$Port = "",
    [string]$DataDir = "",
    [string]$HostAddress = "",
    [switch]$Force,
    [switch]$NewSecret
  )

  if (-not (Test-Path -LiteralPath $TemplatePath -PathType Leaf)) {
    throw "Configuration template not found: $TemplatePath"
  }

  $exists = Test-Path -LiteralPath $Path -PathType Leaf
  $resolvedSecret = $Secret
  if ($exists -and -not $NewSecret) {
    $existingSecret = Get-FunnelEnvValue -Path $Path -Key "FUNNEL_SECRET"
    if ($existingSecret) { $resolvedSecret = $existingSecret }
  }

  if ($exists) {
    if (-not $Force) {
      return $false
    }
    $backup = "$Path.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $Path -Destination $backup -Force
    Write-Verbose "Backed up existing configuration to $backup"
  }

  $lines = @(Get-Content -LiteralPath $TemplatePath)

  $values = [ordered]@{
    FUNNEL_URL    = $PublicUrl
    FUNNEL_SECRET = $resolvedSecret
    LOG_LEVEL     = $LogLevel
  }
  if ($OnboardingToken) { $values.FUNNEL_ONBOARDING_TOKEN = $OnboardingToken }
  if ($Port) { $values.PORT = $Port }
  if ($DataDir) { $values.FUNNEL_DATA_DIR = $DataDir }
  if ($HostAddress) { $values.HOST = $HostAddress }

  foreach ($key in $values.Keys) {
    $value = Format-FunnelEnvValue ([string]$values[$key])
    $pattern = '^\s*#?\s*' + [regex]::Escape($key) + '\s*='
    $replaced = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
      if ($lines[$index] -match $pattern) {
        $lines[$index] = "$key=$value"
        $replaced = $true
        break
      }
    }
    if (-not $replaced) {
      $lines += "$key=$value"
    }
  }

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  [System.IO.File]::WriteAllLines(
    $Path,
    $lines,
    (New-Object System.Text.UTF8Encoding($false))
  )
  return $true
}

function Resolve-FunnelPublicUrl {
  [CmdletBinding()]
  param(
    [AllowEmptyString()][string]$Url = ""
  )

  if ([string]::IsNullOrWhiteSpace($Url)) { return "" }

  $trimmed = $Url.Trim()
  $uri = $null
  if (-not [Uri]::TryCreate($trimmed, [UriKind]::Absolute, [ref]$uri)) {
    throw "Public URL is not a valid absolute URL."
  }
  if ($uri.Scheme -ne "http" -and $uri.Scheme -ne "https") {
    throw "Public URL must start with http:// or https://."
  }
  if ($uri.AbsolutePath -ne "/" -or $uri.Query -or $uri.Fragment) {
    throw "Public URL must be an origin only (no path, query, or fragment)."
  }
  return $trimmed.TrimEnd("/")
}

function Test-FunnelPortAvailable {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  if ($Port -lt 1 -or $Port -gt 65535) { return $false }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  return ($listeners.Count -eq 0)
}

function Test-FunnelAdministrator {
  $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  return $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Wait-FunnelHealth {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return $true }
    } catch {
      # The service may still be starting.
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}
