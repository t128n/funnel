# funnel-intake

Native Windows helper that turns a global hotkey into a prefilled Funnel intake.

Press the hotkey while text is selected in any app (Teams, Outlook, a browser,
…); the helper captures the selection through the clipboard, maps the
foreground app to a `source`, and opens

```
{FUNNEL_URL}/intake?…            # or ?d=base64url(deflate-raw(json))
```

in the default browser. Nothing is submitted — the form opens as a draft.

The release binary is a GUI-subsystem executable, so no console window flashes
and the listener is already running when the hotkey fires.

## Library use

The root package is importable if you want to embed the listener:

```go
cfg := intake.DefaultConfig()
cfg.BaseURL = "https://funnel.example.com"
cfg.Hotkey = "Alt+F"
cfg.Logger = logger

if err := intake.Run(ctx, cfg); err != nil {
    // ...
}
```

| Symbol | Purpose |
| :--- | :--- |
| `intake.Run(ctx, cfg)` | Registers the hotkey and blocks until `ctx` is cancelled. Windows only. |
| `intake.Preview(cfg)` | Runs one capture and returns the prefill and URL without opening a browser. |
| `intake.ParseHotkey("Ctrl+Alt+I")` | Parses a combo into modifiers + virtual key. |
| `intake.BuildPrefill(selection, source)` | Maps a selection to title/body/source. |
| `intake.BuildURL(base, prefill)` | Builds the `/intake` link and reports trimming. |
| `intake.LoadConfig(path)` | Reads JSON, applies `FUNNEL_URL`/`FUNNEL_HOTKEY`/`FUNNEL_SOURCE`, validates. |

`Config.SourceMap` entries override the built-in process mapping; the built-in
map is applied at lookup time.

## Config

Default location: `%LOCALAPPDATA%\Funnel\Intake\config.json`.

```json
{
  "url": "http://localhost:3000",
  "hotkey": "Alt+F",
  "source": "self-service",
  "sourceMap": {
    "ms-teams": "chat",
    "outlook": "email"
  }
}
```

- `url` — Funnel origin. A path is preserved (`https://host/funnel/` →
  `…/funnel/intake`); query strings and fragments are rejected.
- `hotkey` — at least one modifier plus one key. See `ParseHotkey`.
- `source` — optional fixed source that disables foreground detection.
- `sourceMap` — process name (lower case, no `.exe`) to intake source. An empty
  value removes an override; the built-in defaults then apply again.

Environment overrides (highest precedence after CLI flags): `FUNNEL_URL`,
`FUNNEL_HOTKEY`, `FUNNEL_SOURCE`.

## URL contract

The encoder mirrors `src/lib/client/intake-deeplink.ts`:

- `title` = first non-empty line, whitespace collapsed, max 256.
- `body` = full selection, max 65 536.
- `source` = mapped foreground app, max 128.
- Limits are counted in UTF-16 code units, matching the TypeScript `.slice`.
- The plain and `d=` (deflate-raw + base64url) forms are both built; the shorter
  one is used, and the result must fit in 8 000 characters. If a selection is
  too large, the body is trimmed to fit and the trim is logged.

## Build and test

```sh
mise run intake:exe     # -> dist/funnel-intake.exe
mise run intake:check   # go vet + go test
go -C tools/funnel-intake test ./...
```

Only `golang.org/x/sys/windows` is required; cgo is disabled. The pure parts
(config, hotkey parsing, prefill, deeplink, URL building) compile and are tested
on every OS. `Run`/`Preview` return `ErrUnsupported` elsewhere.

## Known limitations

- Only plain-text clipboard contents are restored after a capture; images and
  files cannot be preserved.
- Synthetic `Ctrl+C` is blocked from reaching elevated apps by Windows UIPI
  unless the helper also runs elevated.
- The captured text appears in the browser URL/history.
- Selections larger than the deeplink limit are truncated (logged, not silent).
