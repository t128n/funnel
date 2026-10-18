# Funnel Intake - instant capture
#
# Grabs the text currently selected in the foreground app (Microsoft Teams,
# Outlook, ...), stages it via `POST /api/intake`, and shows a notification.
#
# Designed to be launched from a global hotkey (see
# scripts/install-intake-shortcut.ps1). There is no console output on the happy
# path - feedback is a Windows notification and everything is logged to
# %TEMP%\funnel-intake.log for troubleshooting.
#
# See docs/SPEC.md §6.1 for the intake contract.

[CmdletBinding()]
param(
    # Funnel instance base URL. `bun run dev` serves on 5173 by default.
    [string]$BaseUrl = "http://localhost:5173",

    # Provenance label sent with the submission. Empty = auto-detect the app.
    [string]$Source = ""
)

$ErrorActionPreference = "Stop"

$LogFile = Join-Path $env:TEMP "funnel-intake.log"
$Sentinel = "funnel-intake-" + [guid]::NewGuid().ToString()

function Write-Log {
    param([string]$Message)
    try {
        $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -LiteralPath $LogFile -Value "$stamp  $Message" -Encoding UTF8
    } catch { }
}

function Show-Notification {
    param(
        [string]$Message,
        [ValidateSet("Info", "Error")][string]$Kind = "Info"
    )
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $icon = if ($Kind -eq "Error") {
            [System.Drawing.SystemIcons]::Error
        } else {
            [System.Drawing.SystemIcons]::Information
        }
        $notify = New-Object System.Windows.Forms.NotifyIcon
        $notify.Icon = $icon
        $notify.BalloonTipTitle = "Funnel Intake"
        $notify.BalloonTipText = $Message
        $notify.BalloonTipIcon = if ($Kind -eq "Error") {
            [System.Windows.Forms.ToolTipIcon]::Error
        } else {
            [System.Windows.Forms.ToolTipIcon]::Info
        }
        $notify.Visible = $true
        $notify.ShowBalloonTip(5000)
        # Keep the process alive long enough for the balloon to render, then
        # clean up so the tray icon does not linger.
        Start-Sleep -Milliseconds 4000
        $notify.Dispose()
    } catch {
        Write-Log "notification failed: $($_.Exception.Message)"
    }
}

# --- Win32 helpers -----------------------------------------------------------

if (-not ("Funnel.Native" -as [type])) {
    Add-Type -Namespace Funnel -Name Native -MemberDefinition @"
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
"@
}

$VK_CONTROL = 0x11
$VK_C = 0x43
$KEYEVENTF_KEYUP = 0x02

function Send-CopyKeystroke {
    [Funnel.Native]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
    [Funnel.Native]::keybd_event($VK_C, 0, 0, [UIntPtr]::Zero)
    [Funnel.Native]::keybd_event($VK_C, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
    [Funnel.Native]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Get-ForegroundProcessName {
    try {
        $hwnd = [Funnel.Native]::GetForegroundWindow()
        $procId = 0
        [void][Funnel.Native]::GetWindowThreadProcessId($hwnd, [ref]$procId)
        if ($procId -le 0) { return "unknown" }
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) { return $proc.ProcessName }
    } catch {
        Write-Log "foreground detection failed: $($_.Exception.Message)"
    }
    return "unknown"
}

function Get-ClipboardText {
    # Returns the clipboard's plain text, or $null when it holds no text.
    try {
        return (Get-Clipboard -Raw -ErrorAction Stop)
    } catch {
        return $null
    }
}

# --- Capture the current selection ------------------------------------------

try {
    # Source: explicit parameter wins, otherwise name the foreground app.
    if ([string]::IsNullOrWhiteSpace($Source)) {
        $procName = Get-ForegroundProcessName
        switch -Regex ($procName) {
            '^(ms-teams|Teams)$' { $Source = "ms-teams"; break }
            '^(OUTLOOK|outlook)$' { $Source = "outlook"; break }
            default { $Source = $procName.ToLowerInvariant() }
        }
    }

    # Preserve whatever the user already had on the clipboard. Non-text
    # content (images, files) cannot be restored, so we note that and move on.
    $originalText = Get-ClipboardText
    $hadText = -not [string]::IsNullOrEmpty($originalText)

    # Seed the clipboard with a unique marker so we can tell whether the copy
    # actually picked anything up.
    Set-Clipboard -Value $Sentinel

    Send-CopyKeystroke

    $selected = $null
    $deadline = (Get-Date).AddMilliseconds(1200)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 80
        $current = Get-ClipboardText
        if ($null -ne $current -and $current.Trim() -ne $Sentinel) {
            $selected = $current
            break
        }
    }

    # Restore the user's original clipboard as soon as possible.
    if ($hadText) {
        try { Set-Clipboard -Value $originalText } catch { }
    } else {
        try { Set-Clipboard -Value "" } catch { }
    }

    if ([string]::IsNullOrWhiteSpace($selected)) {
        Write-Log "no selection captured (source=$Source)"
        Show-Notification -Kind Error -Message "Nothing selected - select some text first."
        exit 0
    }

    # title = first non-empty line (whitespace collapsed, <=256 chars).
    $firstLine = ($selected -split "\r\n|\n|\r" |
        Where-Object { $_.Trim().Length -gt 0 } |
        Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($firstLine)) {
        $firstLine = "Intake from $Source"
    }
    $title = ($firstLine -replace "\s+", " ").Trim()
    if ($title.Length -gt 256) { $title = $title.Substring(0, 256) }

    # body = the full selection (<=65536 chars).
    $body = $selected
    if ($body.Length -gt 65536) { $body = $body.Substring(0, 65536) }

    $payload = @{ title = $title; body = $body; source = $Source }
    $json = $payload | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    $url = $BaseUrl.TrimEnd("/") + "/api/intake"
    try {
        $response = Invoke-RestMethod -Uri $url -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $bytes -TimeoutSec 10
        Write-Log "created id=$($response.id) source=$Source title=$title"
        Show-Notification -Message "Intake created: $($response.id)"
    } catch {
        # A 400 from the API carries a JSON body with `message`/`issues`.
        $detail = $null
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            try {
                $parsed = $_.ErrorDetails.Message | ConvertFrom-Json
                $detail = $parsed.message
                if ($parsed.issues) { $detail += ": " + ($parsed.issues -join "; ") }
            } catch {
                $detail = $_.ErrorDetails.Message
            }
        }
        if (-not $detail) {
            $detail = "Funnel not reachable at $BaseUrl - is the dev server running?"
        }
        Write-Log "submit failed: $detail ($($_.Exception.Message))"
        Show-Notification -Kind Error -Message $detail
    }
} catch {
    Write-Log "unhandled error: $($_.Exception.ToString())"
    Show-Notification -Kind Error -Message "Funnel Intake failed: $($_.Exception.Message)"
}
