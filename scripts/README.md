# scripts

Helpers for Funnel. The intake app is now one Rust binary (daemon + Rune
settings window); the previous helper implementations have been
removed.

## Brand icons

`static/favicon.svg` is the source of truth for the Funnel mark and its colour.
Regenerate the committed raster set after changing it:

```sh
bun scripts/generate-icons.ts
```

The script renders the SVG with Playwright at 16, 32, 48, 180, 192 and 512 px
and writes `static/favicon.ico`, `static/apple-touch-icon.png`,
`static/icon-192.png` and `static/icon-512.png`.

## Intake app

`funnel-intake` runs in the background (started at login), registers a global
hotkey, and opens a prefilled Funnel intake form for the current text
selection. The same executable opens the settings/status window with
`funnel-intake settings`. Implementation and build docs live in
[`tools/funnel-intake`](../tools/funnel-intake/README.md).

### Windows

```powershell
# build -> dist\funnel-intake.exe
mise run intake:exe

# install for the current user (default Alt+F, http://localhost:3000)
powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1

# a different instance and combo
powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1 `
  -Url https://funnel.example.com -Hotkey "Ctrl+Shift+I"

# open settings after installing
& "$env:LOCALAPPDATA\Funnel\Intake\funnel-intake.exe" settings

# remove it
powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1 -Uninstall
```

The installer copies the binary to `%LOCALAPPDATA%\Funnel\Intake\`, writes
`config.json`, creates a Startup shortcut, and starts the daemon. It also
removes the legacy Start Menu `.lnk` that owned `Ctrl+Alt+I`, which can conflict
if that hotkey is configured. Run it again after a rebuild to upgrade.
`mise run intake:install` and `mise run intake:uninstall` wrap the same script.

### macOS

Download and extract `funnel-intake-<version>-darwin-<arch>.zip`, then run:

```sh
./install-intake.sh --url http://localhost:3000
```

Or build and install from a checkout:

```sh
mise run intake:exe
mise run intake:install:macos
```

The installer copies the binary to
`~/Library/Application Support/Funnel/Intake/`, writes the config, installs a
LaunchAgent, and starts the daemon. The first capture asks for Accessibility
permission (System Settings → Privacy & Security → Accessibility). Remove it
with `mise run intake:uninstall:macos`.

### Where things live

| Platform | Binary | Config | Log |
| :--- | :--- | :--- | :--- |
| Windows | `%LOCALAPPDATA%\Funnel\Intake\funnel-intake.exe` | `%LOCALAPPDATA%\Funnel\Intake\config.json` | `intake.log` beside it |
| macOS | `~/Library/Application Support/Funnel/Intake/funnel-intake` | `.../Funnel/Intake/config.json` | `intake.log` beside it |

Windows autostart uses the Startup shortcut created by the installer; the
`autostart` subcommand is also available. macOS uses
`~/Library/LaunchAgents/com.t128n.funnel.intake.plist`.

### Configuration

```json
{
  "url": "http://localhost:3000",
  "hotkey": "Alt+F",
  "sourceMap": { "ms-teams": "chat", "outlook": "email" }
}
```

macOS defaults to `Option+F`; `Alt`, `Opt` and `Option` are aliases. Environment
variables override the file: `FUNNEL_URL`, `FUNNEL_HOTKEY`, `FUNNEL_SOURCE`.
Command-line flags override both: `-url`, `-hotkey`, `-source`, `-config`,
`-debug`, `-dry-run`, `-test`, `-check`, `-version`.

The daemon reloads the config without a restart, including the shortcut.

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

Read `intake.log` beside the config first. Useful checks:

```sh
# validate config without listening
funnel-intake check

# capture the current selection once and print the result (no browser)
funnel-intake test

# log what the hotkey would open, without launching a browser
funnel-intake daemon --dry-run

# exercise the whole pipeline with a fake selection
funnel-intake daemon --simulate "Hello world"
```

- **Hotkey does nothing / "already registered".** Another app owns the combo,
  or the legacy `.lnk` is still present. Run the installer again (it removes the
  legacy shortcut) or pick a different `-Hotkey`.
- **Nothing captured.** The target app must be focused when the hotkey fires.
  Some apps ignore synthetic `Ctrl+C`; try copying manually and using the
  editor. Elevated apps cannot be captured unless the helper is elevated too.
  On macOS, grant Accessibility permission.
- **Browser does not open.** Check the log for the `ShellExecute`/`open` error.

## Other scripts

| Script | Purpose |
| :--- | :--- |
| `build-intake.ts` | Builds the Rust intake app into `dist/` (`mise run intake:exe`). |
| `build-standalone.ts` | Builds the self-contained Funnel server executable. |
| `package-release.ts` | Packages a platform executable into `release/` for the GitHub release workflow. |
| `release-notes.ts` | Builds a GitHub release body from the Changesets `CHANGELOG.md` entry. |
| `release.ts` | Applies pending database migrations. |
| `smoke-standalone.ts` | Smoke-tests the packaged executable in `dist/` (`mise run smoke`). |
| `install-intake.ps1` | Installs/removes the intake app on Windows. |
| `install-intake.sh` | Installs/removes the intake app on macOS. |
