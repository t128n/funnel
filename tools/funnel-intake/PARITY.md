# Intake helper parity checklist

The existing Go helper is the release implementation. The Rust prototype is not
a replacement until the unchecked items are implemented and tested.

## Existing Windows contract

- [ ] Register the configured global hotkey on a dedicated message-loop thread;
  reject registration failures, suppress key repeat and avoid overlapping captures.
- [ ] On activation, identify the foreground process and capture the selection
  **before opening the browser**. Wait up to 750 ms for modifiers to be released,
  preserve the previous plain-text clipboard, place a unique sentinel on it,
  send Ctrl+C and wait up to 1.2 seconds for a changed clipboard. Restore the
  previous text (non-text clipboard formats are not preserved). An empty or
  failed capture still opens a blank draft with the detected source.
- [ ] Map process names to sources using user overrides followed by built-in
  mappings, unless a fixed source is configured. Unknown process names are
  passed through; failed detection uses `unknown`.
- [ ] Use the first non-empty collapsed line as title and the selection as body.
  Clamp title, body and source to 256, 65,536 and 128 UTF-16 units without
  splitting a surrogate pair. Rust has a partial port in `rust/src/prefill.rs`.
- [ ] Append `/intake` to the configured base URL's path. Use the shorter of
  URL-encoded parameters and `d=base64url(deflate-raw(json))`; trim the body if
  needed to fit the 8,000-character query limit and log trimming. Open the URL
  with the default browser only after capture and encoding have finished.
- [ ] Read `%LOCALAPPDATA%\Funnel\Intake\config.json`, accepting UTF-8 BOM and
  the `url`, `hotkey`, `source` and `sourceMap` fields. Missing files use
  defaults. Environment `FUNNEL_URL`, `FUNNEL_HOTKEY`, `FUNNEL_SOURCE` override
  file values; CLI `-url`, `-hotkey`, `-source` override the environment.
  Default URL is `http://localhost:3000`; default hotkey is `Alt+F`.
- [ ] Preserve the `-config`, `-check`, `-test`, `-dry-run`, `-debug` and
  `-version` diagnostic contracts or document intentional replacements.
- [ ] Enforce a single instance and log to `intake.log` beside the config,
  rotating at 1 MiB to `intake.log.old`. Errors are reported without logging
  selected text; startup failure is shown to the user.
- [ ] The Windows installer copies `funnel-intake.exe` into the config directory,
  writes config while preserving `sourceMap`, creates a per-user Startup folder
  shortcut, removes legacy shortcuts, and starts the helper unless `-NoStart`.
  Uninstall stops it and removes the startup shortcut and install directory unless
  `-KeepConfig` is set. Release packaging must continue to include the executable
  and installer under their expected names.

## New requirements

- [ ] Implement macOS Option+F, selection capture with explicit Accessibility
  permission errors, autostart and a way to reopen settings.
- [ ] Provide Rust daemon and settings commands, config reload, status and
  settings persistence, plus a Windows system tray entry.
- [ ] Verify Windows and macOS runtime behavior and the packaged installer before
  removing Go or declaring the Rust app a replacement.
