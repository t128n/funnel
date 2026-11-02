<#
.SYNOPSIS
  Funnel for Windows setup wizard.

.DESCRIPTION
  A small WinForms front end for install-service.ps1 and the portable mode.
  It collects the install/data directories, port, public URL and optional
  onboarding token, creates .env from the shipped .env.example, and either
  installs the WinSW service or starts a portable copy.

  Service installation needs an elevated PowerShell window. The wizard offers
  a Restart as administrator button; portable mode does not need elevation.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup.ps1

.EXAMPLE
  # Or double-click setup.cmd.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$common = Join-Path $PSScriptRoot "install-common.ps1"
if (-not (Test-Path -LiteralPath $common -PathType Leaf)) {
  throw "install-common.ps1 is missing next to setup.ps1."
}
. $common

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$script:Installing = $false
$isAdmin = Test-FunnelAdministrator

function New-SetupLabel {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width = 160,
    [int]$Height = 20
  )
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($Width, $Height)
  return $label
}

function New-SetupTextBox {
  param(
    [int]$X,
    [int]$Y,
    [int]$Width = 300
  )
  $box = New-Object System.Windows.Forms.TextBox
  $box.Location = New-Object System.Drawing.Point($X, $Y)
  $box.Size = New-Object System.Drawing.Size($Width, 23)
  return $box
}

function New-SetupButton {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width = 90,
    [int]$Height = 28
  )
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size($Width, $Height)
  return $button
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Funnel Setup"
$form.ClientSize = New-Object System.Drawing.Size(700, 650)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.AutoScaleMode = "Dpi"
$form.AutoScaleDimensions = New-Object System.Drawing.SizeF(96, 96)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$title = New-SetupLabel -Text "Set up Funnel" -X 20 -Y 16 -Width 660 -Height 32
$title.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)

$subtitle = New-SetupLabel -Text "Funnel creates its GitHub App later in the browser. This wizard installs the server, creates .env from .env.example, and starts it." -X 20 -Y 52 -Width 660 -Height 36

$installGroup = New-Object System.Windows.Forms.GroupBox
$installGroup.Text = "Installation"
$installGroup.Location = New-Object System.Drawing.Point(20, 96)
$installGroup.Size = New-Object System.Drawing.Size(660, 180)

$serviceRadio = New-Object System.Windows.Forms.RadioButton
$serviceRadio.Text = "Install as a Windows service (recommended)"
$serviceRadio.Location = New-Object System.Drawing.Point(20, 28)
$serviceRadio.Size = New-Object System.Drawing.Size(320, 22)

$portableRadio = New-Object System.Windows.Forms.RadioButton
$portableRadio.Text = "Portable: copy the executable and run it now"
$portableRadio.Location = New-Object System.Drawing.Point(20, 54)
$portableRadio.Size = New-Object System.Drawing.Size(320, 22)

$adminNote = New-SetupLabel -Text "" -X 20 -Y 82 -Width 620 -Height 20

$installDirLabel = New-SetupLabel -Text "Install directory" -X 20 -Y 112 -Width 110
$installDirBox = New-SetupTextBox -X 135 -Y 108 -Width 420
$browseInstall = New-SetupButton -Text "Browse..." -X 565 -Y 106 -Width 80

$dataDirLabel = New-SetupLabel -Text "Data directory" -X 20 -Y 142 -Width 110
$dataDirBox = New-SetupTextBox -X 135 -Y 138 -Width 420
$browseData = New-SetupButton -Text "Browse..." -X 565 -Y 136 -Width 80

$installGroup.Controls.AddRange(@(
  $serviceRadio,
  $portableRadio,
  $adminNote,
  $installDirLabel,
  $installDirBox,
  $browseInstall,
  $dataDirLabel,
  $dataDirBox,
  $browseData
))

$networkGroup = New-Object System.Windows.Forms.GroupBox
$networkGroup.Text = "Network and configuration"
$networkGroup.Location = New-Object System.Drawing.Point(20, 286)
$networkGroup.Size = New-Object System.Drawing.Size(660, 170)

$portLabel = New-SetupLabel -Text "Port" -X 20 -Y 30 -Width 70
$portBox = New-SetupTextBox -X 105 -Y 26 -Width 80
$portBox.Text = "3000"

$urlLabel = New-SetupLabel -Text "Public URL" -X 205 -Y 30 -Width 90
$urlBox = New-SetupTextBox -X 300 -Y 26 -Width 340

$tokenLabel = New-SetupLabel -Text "Onboarding token" -X 20 -Y 64 -Width 120
$tokenBox = New-SetupTextBox -X 155 -Y 60 -Width 485
$tokenBox.UseSystemPasswordChar = $true

$firewallCheck = New-Object System.Windows.Forms.CheckBox
$firewallCheck.Text = "Open the Windows firewall port"
$firewallCheck.Location = New-Object System.Drawing.Point(20, 94)
$firewallCheck.Size = New-Object System.Drawing.Size(250, 22)
$firewallCheck.Checked = $true

$openBrowserCheck = New-Object System.Windows.Forms.CheckBox
$openBrowserCheck.Text = "Open Funnel after setup"
$openBrowserCheck.Location = New-Object System.Drawing.Point(300, 94)
$openBrowserCheck.Size = New-Object System.Drawing.Size(250, 22)
$openBrowserCheck.Checked = $true

$replaceEnvCheck = New-Object System.Windows.Forms.CheckBox
$replaceEnvCheck.Text = "Replace an existing .env (back it up first; keeps FUNNEL_SECRET)"
$replaceEnvCheck.Location = New-Object System.Drawing.Point(20, 124)
$replaceEnvCheck.Size = New-Object System.Drawing.Size(620, 22)

$networkGroup.Controls.AddRange(@(
  $portLabel,
  $portBox,
  $urlLabel,
  $urlBox,
  $tokenLabel,
  $tokenBox,
  $firewallCheck,
  $openBrowserCheck,
  $replaceEnvCheck
))

$statusLabel = New-SetupLabel -Text "Review the settings, then choose Install." -X 20 -Y 466 -Width 660 -Height 22

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(20, 492)
$logBox.Size = New-Object System.Drawing.Size(660, 100)
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Font = New-Object System.Drawing.Font("Consolas", 8.5)

$installButton = New-SetupButton -Text "Install" -X 480 -Y 606 -Width 90
$restartButton = New-SetupButton -Text "Restart as admin" -X 360 -Y 606 -Width 110
$cancelButton = New-SetupButton -Text "Cancel" -X 580 -Y 606 -Width 100

$form.Controls.AddRange(@(
  $title,
  $subtitle,
  $installGroup,
  $networkGroup,
  $statusLabel,
  $logBox,
  $installButton,
  $restartButton,
  $cancelButton
))

$form.AcceptButton = $installButton
$form.CancelButton = $cancelButton

function Add-SetupLog {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message
  $logBox.AppendText($line + "`r`n")
  $logBox.SelectionStart = $logBox.TextLength
  $logBox.ScrollToCaret()
  [System.Windows.Forms.Application]::DoEvents()
}

function Set-SetupStatus {
  param([string]$Text)
  $statusLabel.Text = $Text
  [System.Windows.Forms.Application]::DoEvents()
}

function Get-ExistingServicePort {
  param([string]$InstallDir)

  $xmlPath = Join-Path $InstallDir "funnel-service.xml"
  if (-not (Test-Path -LiteralPath $xmlPath -PathType Leaf)) { return $null }

  try {
    [xml]$xml = Get-Content -LiteralPath $xmlPath -Raw
    $entry = @($xml.service.env) | Where-Object { $_.name -eq "PORT" } | Select-Object -First 1
    if ($entry -and $entry.value) { return [int]$entry.value }
  } catch {
    return $null
  }
  return $null
}

function Install-FunnelPortable {
  param(
    [Parameter(Mandatory = $true)][string]$ExePath,
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][string]$DataDir,
    [Parameter(Mandatory = $true)][int]$Port,
    [string]$PublicUrl = "",
    [string]$OnboardingToken = "",
    [switch]$ForceEnv
  )

  New-Item -ItemType Directory -Force -Path $InstallDir, $DataDir | Out-Null

  $target = Join-Path $InstallDir "funnel.exe"
  if ((Resolve-Path -LiteralPath $ExePath).Path -ne $target) {
    Copy-Item -LiteralPath $ExePath -Destination $target -Force
  }

  $template = Find-FunnelEnvTemplate
  if (-not $template) {
    throw "Could not find .env.example next to the installer."
  }

  $envFile = Join-Path $DataDir ".env"
  $wrote = Write-FunnelEnvFile `
    -Path $envFile `
    -TemplatePath $template `
    -Secret (Get-FunnelSecret) `
    -PublicUrl $PublicUrl `
    -OnboardingToken $OnboardingToken `
    -LogLevel "info" `
    -Port "$Port" `
    -DataDir $DataDir `
    -HostAddress $(if ($PublicUrl) { "0.0.0.0" } else { "127.0.0.1" }) `
    -Force:$ForceEnv

  if ($wrote) {
    Add-SetupLog "Wrote configuration from .env.example: $envFile"
  } else {
    Add-SetupLog "Keeping existing configuration: $envFile"
  }

  $stdout = Join-Path $DataDir "funnel.log"
  $stderr = Join-Path $DataDir "funnel.err.log"
  $process = Start-Process `
    -FilePath $target `
    -WorkingDirectory $DataDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru
  Add-SetupLog "Started funnel.exe (PID $($process.Id)); logs: $stdout"
}

function Invoke-FunnelSetup {
  if ($script:Installing) { return }

  $script:Installing = $true
  $installButton.Enabled = $false
  $cancelButton.Enabled = $false
  $restartButton.Enabled = $false

  try {
    $installDir = [Environment]::ExpandEnvironmentVariables($installDirBox.Text.Trim())
    $dataDir = [Environment]::ExpandEnvironmentVariables($dataDirBox.Text.Trim())
    if (-not $dataDir) { $dataDir = $installDir }
    if (-not $installDir) { throw "Choose an install directory." }
    if (-not [System.IO.Path]::IsPathRooted($installDir)) {
      throw "Install directory must be an absolute path."
    }
    if (-not [System.IO.Path]::IsPathRooted($dataDir)) {
      throw "Data directory must be an absolute path."
    }

    $port = 0
    if (-not [int]::TryParse($portBox.Text.Trim(), [ref]$port)) {
      throw "Port must be a number."
    }
    if ($port -lt 1 -or $port -gt 65535) {
      throw "Port must be between 1 and 65535."
    }

    $publicUrl = Resolve-FunnelPublicUrl $urlBox.Text
    $onboardingToken = $tokenBox.Text.Trim()

    if ($serviceRadio.Checked -and -not (Test-FunnelAdministrator)) {
      throw "Installing a Windows service requires administrator rights. Use Portable mode, or choose Restart as admin."
    }

    $existingService = Get-Service -Name "funnel" -ErrorAction SilentlyContinue
    $existingPort = if ($existingService) { Get-ExistingServicePort -InstallDir $installDir } else { $null }
    if (-not (Test-FunnelPortAvailable -Port $port)) {
      if ($existingService -and $existingService.Status -eq "Running" -and $existingPort -eq $port) {
        Add-SetupLog "Port $port is held by the running Funnel service; it will be stopped for the upgrade."
      } else {
        throw "Port $port is already in use. Choose another port or stop the process using it."
      }
    }

    $exePath = Join-Path $PSScriptRoot "funnel.exe"
    if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
      throw "funnel.exe was not found next to setup.ps1. Extract the whole release archive first."
    }

    $envFile = Join-Path $dataDir ".env"
    if ((Test-Path -LiteralPath $envFile -PathType Leaf) -and -not $replaceEnvCheck.Checked) {
      Add-SetupLog "Existing .env will be kept. Check Replace to back it up and regenerate it."
    }

    Set-SetupStatus "Installing..."
    Add-SetupLog "Install directory: $installDir"
    Add-SetupLog "Data directory: $dataDir"
    Add-SetupLog "Port: $port"
    if ($publicUrl) { Add-SetupLog "Public URL: $publicUrl" }

    if ($serviceRadio.Checked) {
      Add-SetupLog "Installing the Windows service..."
      $installScript = Join-Path $PSScriptRoot "install-service.ps1"
      if (-not (Test-Path -LiteralPath $installScript -PathType Leaf)) {
        throw "install-service.ps1 was not found next to setup.ps1."
      }

      $installArgs = @{
        ExePath = $exePath
        InstallDir = $installDir
        DataDir = $dataDir
        Port = $port
        LogLevel = "info"
        PublicUrl = $publicUrl
        OnboardingToken = $onboardingToken
        EnvTemplate = (Find-FunnelEnvTemplate)
      }
      if ($replaceEnvCheck.Checked) {
        $installArgs.ForceEnv = $true
        $installArgs.ForceServiceConfig = $true
      }
      if (-not $firewallCheck.Checked) { $installArgs.SkipFirewall = $true }
      if (-not $openBrowserCheck.Checked) { $installArgs.NoStart = $true }

      & $installScript @installArgs *>&1 | ForEach-Object { Add-SetupLog $_.ToString() }
    } else {
      Add-SetupLog "Installing portable copy..."
      if ($publicUrl) {
        Add-SetupLog "Portable mode binds 0.0.0.0 but does not add a Windows firewall rule."
      }
      $portableArgs = @{
        ExePath = $exePath
        InstallDir = $installDir
        DataDir = $dataDir
        Port = $port
        PublicUrl = $publicUrl
        OnboardingToken = $onboardingToken
      }
      if ($replaceEnvCheck.Checked) { $portableArgs.ForceEnv = $true }
      Install-FunnelPortable @portableArgs
    }

    if ($openBrowserCheck.Checked) {
      Add-SetupStatus "Waiting for Funnel..."
      Add-SetupLog "Waiting for the health endpoint..."
      if (Wait-FunnelHealth -Port $port -TimeoutSeconds 45) {
        Add-SetupLog "Funnel is healthy."
        $openUrl = if ($publicUrl) {
          "$publicUrl/onboarding"
        } elseif ($serviceRadio.Checked) {
          "http://localhost:$port/onboarding"
        } else {
          "http://127.0.0.1:$port/onboarding"
        }
        Add-SetupLog "Opening $openUrl"
        try {
          Start-Process $openUrl
        } catch {
          Add-SetupLog "Could not open the browser automatically: $($_.Exception.Message)"
        }
      } else {
        Add-SetupLog "Funnel did not answer /healthz within 45 seconds. Check the service log or start it manually."
        Set-SetupStatus "Installed, but the health check timed out."
      }
    }

    Set-SetupStatus "Done."
    [System.Windows.Forms.MessageBox]::Show(
      "Funnel setup finished.`r`n`r`nNext step: finish the GitHub App onboarding in the browser.",
      "Funnel Setup",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
  } catch {
    Add-SetupLog "ERROR: $($_.Exception.Message)"
    Set-SetupStatus "Setup failed."
    [System.Windows.Forms.MessageBox]::Show(
      $_.Exception.Message,
      "Funnel Setup",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  } finally {
    $script:Installing = $false
    $installButton.Enabled = $true
    $cancelButton.Enabled = $true
    $restartButton.Enabled = -not $isAdmin
  }
}

$browseInstall.Add_Click({
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select the Funnel install directory"
  $dialog.SelectedPath = $installDirBox.Text
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $installDirBox.Text = $dialog.SelectedPath
  }
})

$browseData.Add_Click({
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select the Funnel data directory"
  $dialog.SelectedPath = $dataDirBox.Text
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $dataDirBox.Text = $dialog.SelectedPath
  }
})

$serviceRadio.Add_CheckedChanged({
  $firewallCheck.Enabled = $serviceRadio.Checked
})

$restartButton.Add_Click({
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments
  $form.Close()
})

$installButton.Add_Click({
  Invoke-FunnelSetup
})

$cancelButton.Add_Click({
  $form.Close()
})

$form.Add_FormClosing({
  param($sender, $eventArgs)
  if ($script:Installing) {
    $eventArgs.Cancel = $true
  }
})

$defaultInstallDir = if ($isAdmin) {
  Join-Path $env:ProgramData "Funnel"
} else {
  Join-Path $env:LOCALAPPDATA "Funnel"
}
$installDirBox.Text = $defaultInstallDir
$dataDirBox.Text = $defaultInstallDir

if ($isAdmin) {
  $serviceRadio.Checked = $true
  $portableRadio.Checked = $false
  $restartButton.Visible = $false
  $adminNote.Text = "Running as administrator. Service installation is available."
  $adminNote.ForeColor = [System.Drawing.Color]::FromArgb(0, 110, 40)
} else {
  $serviceRadio.Checked = $false
  $serviceRadio.Enabled = $false
  $portableRadio.Checked = $true
  $restartButton.Visible = $true
  $adminNote.Text = "Not running as administrator. Portable mode is available; use Restart as admin for a service install."
  $adminNote.ForeColor = [System.Drawing.Color]::FromArgb(170, 80, 0)
}

[void]$form.ShowDialog()
$form.Dispose()
