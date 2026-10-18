# Installs (or removes) the global hotkey that runs scripts\intake.ps1.
#
# A Windows .lnk only fires its "Shortcut key" when it lives in the Start Menu
# (or on the Desktop), so this creates it under Programs. Windows only allows
# Ctrl+Alt+<key> / Ctrl+Shift+<key> combos for .lnk hotkeys.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1 -Uninstall

[CmdletBinding()]
param(
    [string]$Hotkey = "Ctrl+Alt+I",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$lnkPath = Join-Path $startMenu "Funnel Intake.lnk"

if ($Uninstall) {
    if (Test-Path -LiteralPath $lnkPath) {
        Remove-Item -LiteralPath $lnkPath -Force
        Write-Host "Removed shortcut: $lnkPath"
    } else {
        Write-Host "No shortcut found at: $lnkPath"
    }
    exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot "intake.ps1"
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Cannot find intake script at $scriptPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Hotkey = $Hotkey
$shortcut.Description = "Stage the selected text as a Funnel intake"
$shortcut.Save()

Write-Host "Created shortcut: $lnkPath"
Write-Host "  Target : $powershell"
Write-Host "  Script : $scriptPath"
Write-Host "  Hotkey : $Hotkey"
Write-Host ""
Write-Host "Select text in Teams/Outlook and press $Hotkey."
Write-Host "If the hotkey does not respond immediately, sign out and back in so"
Write-Host "Explorer picks up the registration."
