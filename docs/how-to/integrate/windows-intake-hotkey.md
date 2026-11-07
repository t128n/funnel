# Windows intake hotkey

Capture the text currently selected in a Windows app and open a prefilled Funnel intake draft with a single global hotkey, without leaving the app or switching windows.

The helper is a small resident Go executable (`funnel-intake.exe`). It registers the hotkey itself, captures the selection through the clipboard, and opens `{FUNNEL_URL}/intake?…` in the default browser. Nothing is submitted: the form opens as an editable draft.

## Prerequisites

- Windows 10 or 11.
- A reachable Funnel instance. The dev server (`bun run dev`) listens on `http://localhost:5173`; the packaged service listens on `http://localhost:3000`.

## Install

1. Download `funnel-0.0.12-windows-x64.zip` and `SHA256SUMS.txt` from [release v0.0.12](https://github.com/t128n/funnel/releases/tag/v0.0.12). Both files should appear in your downloads; the Windows server archive also contains the helper.

2. In PowerShell, from the download directory, check the archive against the matching entry in `SHA256SUMS.txt`:

   ```powershell
   Get-FileHash .\funnel-0.0.12-windows-x64.zip -Algorithm SHA256
   ```

   The displayed hash must match the `funnel-0.0.12-windows-x64.zip` entry in `SHA256SUMS.txt`; do not install if it differs.

3. Extract the ZIP and open PowerShell in its inner `funnel-0.0.12-windows-x64` folder. It contains `funnel-intake.exe`, `install-intake.ps1` and `README.txt`. Install for the current user, replacing the URL with your reachable Funnel instance:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-intake.ps1 -Url http://localhost:3000
   ```

The installer prints the installed executable, configuration, log, hotkey and URL. It does not require administrator rights. `ExecutionPolicy Bypass` applies to this PowerShell invocation; inspect the downloaded script before running it if required by your security policy.

Current packaging code creates a separate `funnel-intake-<version>-windows-x64.zip` for future releases, but v0.0.12 does not provide it. If a later [release](https://github.com/t128n/funnel/releases) lists that asset, verify its checksum and extract it instead; its installer and helper are together in the extracted folder and use the same command.

The installer:

1. Copies the bundled or built `funnel-intake.exe` to `%LOCALAPPDATA%\Funnel\Intake\funnel-intake.exe`.
2. Writes `%LOCALAPPDATA%\Funnel\Intake\config.json` (default `http://localhost:3000`, `Ctrl+Alt+I`).
3. Creates `…\Startup\Funnel Intake.lnk` so the helper starts at login.
4. Removes the legacy `Funnel Intake.lnk` from the Start Menu or Desktop. That shortcut owned `Ctrl+Alt+I`; leaving it in place makes Windows refuse to register the new hotkey.
5. Starts the helper (unless `-NoStart` is passed).

From the extracted release folder, point it at a different instance or hotkey, then verify the process is running:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-intake.ps1 `
  -Url https://funnel.example.com -Hotkey "Ctrl+Shift+I"

Get-Process funnel-intake
```

The installer reports the new URL and hotkey; `Get-Process` lists `funnel-intake` if it stayed running. Reinstalling without `-Url`, `-Hotkey` or `-Source` restores their installer defaults.

| Option | Default | Purpose |
| :--- | :--- | :--- |
| `-Url` | `http://localhost:3000` | Funnel base URL; the helper appends `/intake`. |
| `-Hotkey` | `Ctrl+Alt+I` | Any combo supported by the parser (at least one modifier). |
| `-Source` | auto-detect | Fixed source label; disables foreground-app detection. |
| `-ExePath` | `funnel-intake.exe` beside the script, or `dist\funnel-intake.exe` in a checkout | Binary to install. |
| `-NoStart` | off | Install without launching the helper. |
| `-KeepConfig` | off | With `-Uninstall`, keep `config.json` and the log. |
| `-Uninstall` | — | Stop the helper and remove the shortcut and install directory. |

In a checkout, use `scripts\install-intake.ps1` instead, or the equivalent mise tasks `mise run intake:install` and `mise run intake:uninstall`.

### Optional: build from source

On Windows, follow [development setup](../contribute/development.md#get-a-checkout) to clone the repository, trust mise, install the pinned tools and dependencies. From the checkout root run:

```powershell
mise run intake:exe
powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1 -Url http://localhost:3000
```

The build creates `dist\funnel-intake.exe`; the installer finds it there and reports the installed paths. Replace the URL as above and use `Get-Process funnel-intake` to check that the helper is running.

## Use

Select text in Teams, Outlook, a browser, or any other app, then press the hotkey. The helper builds:

The default browser opens an editable intake draft; review it before submitting. Do not capture sensitive text unless it is appropriate to expose in the browser URL and history.

| Field | Value |
| :--- | :--- |
| `title` | First non-empty line, whitespace collapsed, max 256 characters |
| `body` | The full selection, max 65 536 characters |
| `source` | Teams/Slack/Discord → `chat`, Outlook/Thunderbird → `email`, Zoom/Webex → `meeting`, otherwise the process name |

The helper chooses the shorter plain or compressed `?d=` deeplink, so long selections usually fit. If a selection still exceeds the 8 000-character deeplink limit, the body is trimmed to fit and the trim is logged. With no selection, a blank form opens prefilled with the source only.

## Configure

`%LOCALAPPDATA%\Funnel\Intake\config.json`:

```json
{
  "url": "http://localhost:3000",
  "hotkey": "Ctrl+Alt+I",
  "source": "self-service",
  "sourceMap": { "ms-teams": "chat", "outlook": "email" }
}
```

- `url` — Funnel origin. A base path is preserved (`https://host/funnel/` → `…/funnel/intake`); query strings and fragments are rejected.
- `hotkey` — for example `Ctrl+Alt+I`, `Win+Shift+F9`, `Ctrl+Alt+Space`, `Ctrl+Shift+Numpad5`. At least one modifier is required.
- `source` — optional fixed source; disables foreground detection.
- `sourceMap` — process name (lower case, without `.exe`) to intake source. An empty value removes an override; the built-in defaults then apply again.

Environment variables override the file; command-line flags override both:

| Variable | Flag | Purpose |
| :--- | :--- | :--- |
| `FUNNEL_URL` | `-url` | Funnel base URL. |
| `FUNNEL_HOTKEY` | `-hotkey` | Global hotkey. |
| `FUNNEL_SOURCE` | `-source` | Fixed source label. |
| — | `-config` | Alternative config path. |
| — | `-debug` | Also write logs to stderr when a console is attached. |
| — | `-dry-run` | Log what would be opened instead of launching a browser. |
| — | `-test` | Capture once, print the prefill, and exit. |
| — | `-check` | Validate config and exit. |
| — | `-version` | Print the version and exit. |

## Troubleshooting

Read `%LOCALAPPDATA%\Funnel\Intake\intake.log` first. Useful checks:

```powershell
# validate config without listening
& "$env:LOCALAPPDATA\Funnel\Intake\funnel-intake.exe" -check

# log what the next hotkey would open, without launching a browser
& "$env:LOCALAPPDATA\Funnel\Intake\funnel-intake.exe" -dry-run
```

- **The hotkey does nothing or logs "already registered".** Another application owns the combination, or the legacy `.lnk` is still present. Re-run the installer or choose a different `-Hotkey`.
- **The log shows `no selection captured`.** The target window must be focused when the hotkey fires, and it must respond to synthetic `Ctrl+C`. Some apps copy rich content that is read as plain text.
- **An elevated app is not captured.** Windows UIPI blocks synthetic input from reaching higher-integrity processes unless the helper also runs elevated.
- **The browser does not open.** Check the log for an `open browser:` error (usually no default browser handler).

Known limitations: only plain-text clipboard contents are restored (images and files are replaced); the captured text becomes part of the browser URL and history; the configuration is read at startup, so edits require a restart.

## Uninstall

From the extracted release folder, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-intake.ps1 -Uninstall
```

In a checkout, use `scripts\install-intake.ps1` instead.

The helper stops, the Startup shortcut is removed, and the install directory is deleted. Pass `-KeepConfig` to keep the entire install directory, including the executable, `config.json` and the log.

## Related

- [Intake API](./intake-api.md) — the JSON endpoint the composer posts to.
- [`scripts/README.md`](../../../scripts/README.md) — install and configuration reference.
- [`tools/funnel-intake/README.md`](../../../tools/funnel-intake/README.md) — the Go library and URL contract.
- [`scripts/DEVELOPMENT.md`](../../../scripts/DEVELOPMENT.md) — build, test, and debugging notes.
