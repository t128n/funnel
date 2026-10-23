# scripts

Windows helpers for Funnel. The intake hotkey is now a native Go binary — the
old `intake.ps1` / `install-intake-shortcut.ps1` scripts have been removed.

## Intake hotkey helper

`funnel-intake.exe` runs in the background (started at login), registers a
global hotkey, and opens a prefilled Funnel intake form for the current text
selection. Implementation and library docs live in
[`tools/funnel-intake`](../tools/funnel-intake/README.md).

```powershell
# build -> dist\funnel-intake.exe
mise run intake:exe

# install for the current user (default Ctrl+Alt+I, http://localhost:3000)
powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1

# a different instance and combo
powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1 `
  -Url https://funnel.example.com -Hotkey "Ctrl+Shift+I"

# remove it
powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1 -Uninstall
```

The installer copies the binary to `%LOCALAPPDATA%\Funnel\Intake\`, writes
`config.json`, creates a Startup shortcut, and starts the helper. It also
removes the legacy Start Menu `.lnk` that owned `Ctrl+Alt+I` — otherwise Windows
would refuse to register the combo. Run it again after a rebuild to upgrade.

You can also use the mise tasks: `mise run intake:install` and
`mise run intake:uninstall`.

### Where things live

| Path | Purpose |
| :--- | :--- |
| `%LOCALAPPDATA%\Funnel\Intake\funnel-intake.exe` | Installed binary |
| `%LOCALAPPDATA%\Funnel\Intake\config.json` | URL, hotkey, source overrides |
| `%LOCALAPPDATA%\Funnel\Intake\intake.log` | Runtime log (rotated at 1 MiB) |
| `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Funnel Intake.lnk` | Autostart |

### Configuration

```json
{
  "url": "http://localhost:3000",
  "hotkey": "Ctrl+Alt+I",
  "sourceMap": { "ms-teams": "chat", "outlook": "email" }
}
```

Environment variables override the file: `FUNNEL_URL`, `FUNNEL_HOTKEY`,
`FUNNEL_SOURCE`. Command-line flags override both: `-url`, `-hotkey`, `-source`,
`-config`, `-debug`, `-dry-run`, `-test`, `-check`, `-version`.

The dev server runs on `http://localhost:5173`; the packaged service listens on
`http://localhost:3000`.

### Behaviour

- The title is the first non-empty line (whitespace collapsed, max 256 chars);
  the body is the full selection (max 65 536 chars).
- The source comes from the foreground process: Teams/Slack/Discord → `chat`,
  Outlook/Thunderbird → `email`, Zoom/Webex → `meeting`, otherwise the process
  name itself.
- With no selection, a blank form opens prefilled with the source only.
- The clipboard's text is restored afterwards (non-text contents cannot be).
- Oversized selections are trimmed to fit the 8 000-character deeplink limit,
  and the trim is logged.

### Troubleshooting

Read `%LOCALAPPDATA%\Funnel\Intake\intake.log` first. Useful checks:

```powershell
# validate config without listening
& "$env:LOCALAPPDATA\Funnel\Intake\funnel-intake.exe" -check

# capture the current selection once and print the result (no browser)
go -C tools/funnel-intake run ./cmd/funnel-intake -test

# log what the hotkey would open, without launching a browser
& "$env:LOCALAPPDATA\Funnel\Intake\funnel-intake.exe" -dry-run
```

- **Hotkey does nothing / "already registered".** Another app owns the combo,
  or the legacy `.lnk` is still present. Run the installer again (it removes the
  legacy shortcut) or pick a different `-Hotkey`.
- **Nothing captured.** The target app must be focused when the hotkey fires.
  Some apps ignore synthetic `Ctrl+C`; try copying manually and using the
  editor. Elevated apps cannot be captured unless the helper is elevated too.
- **Browser does not open.** Check the log for `open browser:` errors.

## Other scripts

| Script | Purpose |
| :--- | :--- |
| `build-intake.ts` | Builds `dist/funnel-intake.exe` (`mise run intake:exe`). |
| `build-standalone.ts` | Builds the self-contained Funnel server executable. |
| `release.ts` | Applies pending database migrations. |
| `install-intake.ps1` | Installs/removes the intake hotkey helper. |
