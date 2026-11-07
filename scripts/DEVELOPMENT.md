# Funnel Intake app — development notes

> Status: one Rust app (daemon + Rune settings window). The previous helper implementations are gone. User-facing usage lives in
> [`README.md`](./README.md); the architecture and URL contract live in
> [`tools/funnel-intake/README.md`](../tools/funnel-intake/README.md).

## Goal

Select text in Microsoft Teams / Outlook (or anywhere), press a global hotkey,
and get a prefilled Funnel intake draft `{FUNNEL_URL}/intake?…` in the default
browser — without leaving the app.

## Architecture

```
Startup shortcut / LaunchAgent
  └─ funnel-intake daemon       single instance, started at login
       ├─ global-hotkey         hotkey parsed from config/env/flags
       │    └─ hotkey event
       ├─ capture               foreground process → wait for modifiers →
       │                        seed clipboard → Ctrl/Cmd+C → poll →
       │                        restore clipboard
       ├─ build `title`/`body`/`source`
       ├─ build /intake URL
       └─ ShellExecute / open   browser opens after capture and encoding

funnel-intake settings          Rune window: status, URL, shortcut,
                                source, source map; writes the same config
```

The daemon polls the config file and re-registers the shortcut when it changes.
A `daemon.heartbeat` file lets the settings window show running/stopped.

## Files

| File | Purpose |
| :--- | :--- |
| `tools/funnel-intake/rust/src/config.rs` | JSON + env loading, defaults, validation, save. |
| `tools/funnel-intake/rust/src/hotkey.rs` | Portable hotkey parser and aliases. |
| `tools/funnel-intake/rust/src/prefill.rs` | title/body/source mapping, UTF-16 clamping, source map. |
| `tools/funnel-intake/rust/src/deeplink.rs` | Plain/`d=` query encoding, trim-to-fit, URL building. |
| `tools/funnel-intake/rust/src/pipeline.rs` | Capture → prefill → URL → launcher traits and tests. |
| `tools/funnel-intake/rust/src/daemon.rs` | Hotkey loop, config reload, heartbeat, logging. |
| `tools/funnel-intake/rust/src/settings.rs` | Rune settings/status window and validation. |
| `tools/funnel-intake/rust/src/platform/windows.rs` | Win32 clipboard, foreground app, ShellExecute, tray, autostart. |
| `tools/funnel-intake/rust/src/platform/macos.rs` | Cmd+C, pbpaste/pbcopy, open, Accessibility, LaunchAgent. |
| `tools/funnel-intake/rust/src/platform/hotkey_runtime.rs` | `global-hotkey` mapping and event pump. |
| `scripts/build-intake.ts` | Release build into `dist/`. |
| `scripts/install-intake.ps1` / `.sh` | Install/uninstall on Windows/macOS. |

## Build, test, verify

```sh
mise run intake:exe     # dist/funnel-intake[.exe]
mise run intake:check   # cargo fmt, clippy, test
```

From the crate directory: `cargo build --locked`, `cargo test --locked`,
`cargo clippy --locked --all-targets -- -D warnings`, `cargo fmt --check`.
`mise run verify` also runs the intake checks.

## Debugging checklist

Start with `intake.log` beside the config. No new lines between two runs ⇒ the
hotkey never fired.

- [ ] Is the daemon running? Windows: `Get-Process funnel-intake`; macOS:
      `pgrep -fl funnel-intake`.
- [ ] Does the log show `starting: hotkey=… url=…`? If not, the config is bad
      (`funnel-intake check`) or hotkey registration failed.
- [ ] Another app or the legacy `.lnk` owns the combo? Run the installer to
      remove the legacy shortcut, or pick another `-hotkey`.
- [ ] Does the log show `no selection captured`? Capture problem — the target
      window must be focused and must respond to synthetic copy. On macOS,
      grant Accessibility permission.
- [ ] Does it show `capture failed`? Clipboard contention or a protected target.
- [ ] Does it show `open browser`? ShellExecute/`open` failed (no handler).

Useful commands:

```sh
funnel-intake check
funnel-intake test                 # capture once, no browser
funnel-intake daemon --dry-run     # log what a hotkey would open
funnel-intake daemon --simulate "Hello world"
```

Expected dry-run log line: `dry-run: would open intake URL (… bytes)`.

## Known limitations / ideas

- Only plain-text clipboard contents are restored; images/files are replaced.
- Synthetic keystrokes cannot reach elevated apps on Windows (UIPI).
- macOS requires Accessibility permission.
- The URL carries the selection into browser history.
- Code signing/notarisation is not configured.

## Repo references

- `src/routes/api/intake/+server.ts` — JSON staging endpoint (`201 { id }`).
- `src/routes/intake/+page.server.ts` — `GET /intake` prefill decoding.
- `src/lib/intake-prefill.ts` — shared limits and source normalization.
- `src/lib/client/intake-deeplink.ts` — browser deeplink encoder (mirrored here).
- `src/lib/server/intake/prefill.ts` — server-side `?d=` decoder.
- [Intake lifecycle](../docs/explanation/intake-lifecycle.md) — intake & staging pipeline.
- [Build tasks](../docs/reference/build-tasks.md) — the `mise` tasks and what each one produces.
