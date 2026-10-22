# Funnel Intake hotkey — development notes

> Status: implemented as a native Go helper. The previous PowerShell script is
> gone. User-facing usage lives in [`README.md`](./README.md); the library and
> URL contract live in [`tools/funnel-intake/README.md`](../tools/funnel-intake/README.md).

## Goal

Select text in Microsoft Teams / Outlook (or anywhere), press a global hotkey,
and get a prefilled Funnel intake draft `{FUNNEL_URL}/intake?…` in the default
browser — without leaving the app.

## Architecture

```
Startup .lnk (no shortcut key)
  └─ funnel-intake.exe        GUI subsystem, single instance, started at login
       └─ RegisterHotKey      hotkey parsed from config/env/flags
            └─ WM_HOTKEY      message loop on a locked OS thread
                 └─ capture  foreground process → wait for modifiers →
                             seed clipboard → SendInput Ctrl+C → poll →
                             restore clipboard
                      └─ build `title`/`body`/`source`
                           └─ ShellExecute  {url}/intake?… or ?d=…
```

Because the listener is already resident, the hotkey path pays no process
startup. `-H=windowsgui` suppresses the console.

## Files

| File | Purpose |
| :--- | :--- |
| `tools/funnel-intake/intake.go` | `Config`, `Run` (platform dispatcher), `ErrUnsupported`. |
| `tools/funnel-intake/config.go` | JSON + env loading, defaults, validation. |
| `tools/funnel-intake/hotkey.go` | Portable hotkey parser. |
| `tools/funnel-intake/prefill.go` | title/body/source mapping, UTF-16 clamping, source map. |
| `tools/funnel-intake/deeplink.go` | Plain/`d=` query encoding, trim-to-fit, URL building. |
| `tools/funnel-intake/run_windows.go` | Windows `run`, `Preview`, hotkey handler. |
| `tools/funnel-intake/hotkey_windows.go` | `RegisterHotKey` + message loop. |
| `tools/funnel-intake/capture_windows.go` | Clipboard capture/restore + sentinel. |
| `tools/funnel-intake/win32_windows.go` | Win32 procs, clipboard, foreground app, ShellExecute. |
| `tools/funnel-intake/input_windows_{64,32}.go` | `SendInput` (64-bit) / `keybd_event` (32-bit). |
| `tools/funnel-intake/cmd/funnel-intake` | CLI: flags, logging, single instance, dialogs. |
| `tools/funnel-intake/*_test.go` | Parser, prefill, deeplink, config, struct sizes. |
| `scripts/build-intake.ts` | Cross-builds the GUI exe into `dist/`. |
| `scripts/install-intake.ps1` | Install/uninstall + legacy shortcut cleanup. |

## Build, test, verify

```sh
mise run intake:exe     # dist/funnel-intake.exe (windows/amd64, no cgo)
mise run intake:check   # go vet + go test
go -C tools/funnel-intake test ./...
```

`mise run exe` builds both `funnel.exe` and `funnel-intake.exe`; `mise run
verify` runs the Go checks too. `go vet` needs `-unsafeptr=false` because the
clipboard code converts Win32 `GlobalLock` pointers, a known false positive.

## Debugging checklist

Start with `%LOCALAPPDATA%\Funnel\Intake\intake.log`. No new lines between
two runs ⇒ the hotkey never fired.

- [ ] Is the helper running? `Get-Process funnel-intake`.
- [ ] Does the log show `starting: hotkey=… url=…`? If not, the config is bad
      (`-check`) or `RegisterHotKey` failed ("already registered").
- [ ] Another app or the legacy `.lnk` owns the combo? Run the installer to
      remove the legacy shortcut, or pick another `-Hotkey`.
- [ ] Does the log show `no selection captured`? Capture problem — the target
      window must be focused and must respond to synthetic `Ctrl+C`.
- [ ] Does it show `capture failed`? Clipboard contention or a protected target.
- [ ] Does it show `open browser`? ShellExecute failed (no default browser).

Useful commands:

```powershell
# validate config
& "$env:LOCALAPPDATA\Funnel\Intake\funnel-intake.exe" -check

# capture once from a console build and print the result
go -C tools/funnel-intake run ./cmd/funnel-intake -test -debug

# listen and log the prefill without opening a browser
& "$env:LOCALAPPDATA\Funnel\Intake\funnel-intake.exe" -dry-run
```

To exercise the whole hotkey path without a browser, run `-dry-run` with a free
combo and send it synthetically:

```powershell
# terminal A
mise run intake:exe
.\dist\funnel-intake.exe -dry-run -hotkey "Ctrl+Alt+Shift+F24"

# terminal B (keybd_event for Ctrl+Alt+Shift+F24); read the log afterwards
```

Expected log line: `dry-run: would open intake (app=… source=… title=… body=…)`.

## Known limitations / ideas

- Only plain-text clipboard contents are restored; images/files are replaced.
- Synthetic keystrokes cannot reach elevated apps (Windows UIPI).
- No tray icon: stop the helper with the uninstaller, Task Manager, or logout.
  A tray icon with Open/Reload/Quit is a possible follow-up.
- Config is read at startup; changing it requires a restart.
- The URL carries the selection into browser history.
- Could add a compressed deeplink cap warning dialog, or keep trimming silent
  except in the log (current behaviour).

## Repo references

- `src/routes/api/intake/+server.ts` — JSON staging endpoint (`201 { id }`).
- `src/routes/intake/+page.server.ts` — `GET /intake` prefill decoding.
- `src/lib/intake-prefill.ts` — shared limits and source normalization.
- `src/lib/client/intake-deeplink.ts` — browser deeplink encoder (mirrored here).
- `src/lib/server/intake/prefill.ts` — server-side `?d=` decoder.
- [Intake lifecycle](../docs/explanation/intake-lifecycle.md) — intake & staging pipeline.
- [Build tasks](../docs/reference/build-tasks.md) — the `mise` tasks and what each one produces.
