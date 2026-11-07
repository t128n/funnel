# Intake app parity checklist

The Rust app in `rust/` replaces the previous helper implementation. This checklist keeps
the original Windows contract and the new macOS requirements in one place.

## Windows contract

- [x] Register the configured global hotkey, reject registration failures,
  suppress key repeat and avoid overlapping captures.
- [x] On activation, identify the foreground process and capture the selection
  **before opening the browser**. Wait up to 750 ms for modifiers to be released,
  preserve the previous plain-text clipboard, place a unique sentinel on it,
  send `Ctrl+C` and wait up to 1.2 seconds for a changed clipboard. Restore the
  previous text (non-text clipboard formats are not preserved). An empty or
  failed capture still opens a blank draft with the detected source.
- [x] Map process names to sources using user overrides followed by built-in
  mappings, unless a fixed source is configured. Unknown process names are
  passed through; failed detection uses `unknown`.
- [x] Use the first non-empty collapsed line as title and the selection as body.
  Clamp title, body and source to 256, 65,536 and 128 UTF-16 units without
  splitting a surrogate pair.
- [x] Append `/intake` to the configured base URL's path. Use the shorter of
  URL-encoded parameters and `d=base64url(deflate-raw(json))`; trim the body if
  needed to fit the 8,000-character query limit and log trimming. Open the URL
  with the default browser only after capture and encoding have finished.
- [x] Read `%LOCALAPPDATA%\Funnel\Intake\config.json`, accepting UTF-8 BOM and
  the `url`, `hotkey`, `source` and `sourceMap` fields. Missing files use
  defaults. Environment `FUNNEL_URL`, `FUNNEL_HOTKEY`, `FUNNEL_SOURCE` override
  file values; CLI `-url`, `-hotkey`, `-source` override the environment.
  Default URL is `http://localhost:3000`; default hotkey is `Alt+F`.
- [x] Preserve the `-config`, `-check`, `-test`, `-dry-run`, `-debug` and
  `-version` diagnostic contracts (with `daemon`/`settings` subcommands added).
- [x] Enforce a single instance and log to `intake.log` beside the config,
  rotating at 1 MiB to `intake.log.old`. Errors are reported without logging
  selected text; startup failure is shown to the user.
- [x] The Windows installer copies `funnel-intake.exe` into the config directory,
  writes config while preserving `sourceMap`, creates a per-user Startup folder
  shortcut, removes legacy shortcuts, and starts the helper unless `-NoStart`.
  Uninstall stops it and removes the startup shortcut and install directory unless
  `-KeepConfig` is set. Release packaging includes the executable and installer
  under their expected names.

## New requirements

- [x] Implement macOS `Option+F`, selection capture with explicit Accessibility
  permission errors, autostart and a way to reopen settings.
- [x] Provide Rust daemon and settings commands, config reload, status and
  settings persistence, plus a Windows system tray entry.
- [ ] Verify Windows and macOS runtime behavior on physical desktops and the
  packaged installer before removing the last caveats below.

## Verification status

Verified in CI or locally:

- Cargo build, unit/integration tests, clippy and formatting on Linux, Windows
  and macOS runners.
- Simulated intake pipeline (exact URL, capture-before-launch ordering).
- Config reload: changing the shortcut re-registers the new hotkey.
- Headless Rune settings render on Linux (lavapipe screenshot artifact).
- Windows and macOS CI smoke: `--simulate`, `--check`, `autostart status`, and
  starting the daemon without it exiting immediately.

Not verified (no physical desktop in CI):

- Real global-hotkey presses and clipboard captures against Teams/Outlook/etc.
- macOS Accessibility permission prompts and actual `Cmd+C` posting.
- Visual tray icon/menu and installer upgrade/uninstall on real machines.
- Code signing or notarisation of either binary.
