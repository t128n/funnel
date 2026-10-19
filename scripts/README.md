# scripts

Windows helpers for staging Funnel intakes straight from a text selection.

> **Status: work in progress — not yet verified working.**
> See [DEVELOPMENT.md](./DEVELOPMENT.md) for current state, debugging steps, and
> next steps.

## `intake.ps1`

Copies the text currently selected in the foreground app (Microsoft Teams,
Outlook, ...), then `POST`s it to `POST /api/intake`. It maps the selection to
the API payload as:

| Field    | Value                                                          |
| :------- | :------------------------------------------------------------- |
| `title`  | First non-empty line, whitespace collapsed, max 256 chars      |
| `body`   | The full selection, max 65536 chars                            |
| `source` | Detected app (`ms-teams`, `outlook`, ...), else the process name |

Feedback is a Windows notification (success carries the staged id, failures
carry the API message or a "server not reachable" hint). Everything is logged to
`%TEMP%\funnel-intake.log`.

Behaviour notes:

- The clipboard is **restored** afterwards, so your copy history is untouched
  (non-text clipboard contents such as images cannot be restored).
- With no selection, nothing is submitted.
- Defaults to the dev server at `http://localhost:5173`; override with
  `-BaseUrl https://funnel.example.com`.

## `install-intake-shortcut.ps1`

Creates a Start Menu shortcut `Funnel Intake.lnk` bound to a global hotkey
(default `Ctrl+Alt+I`) that runs `intake.ps1` hidden.

```powershell
# install (Ctrl+Alt+I)
powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1

# a different combo
powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1 -Hotkey "Ctrl+Shift+I"

# remove it
powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1 -Uninstall
```

Then select text in Teams/Outlook and press the hotkey.

Notes:

- The shortcut must stay in the Start Menu for the hotkey to fire globally.
- `.lnk` hotkeys only support `Ctrl+Alt+<key>` / `Ctrl+Shift+<key>`.
- A console may flash briefly on trigger; that is the hidden PowerShell host
  starting up.
- The hotkey silently does nothing if the Funnel instance is not running - check
  `%TEMP%\funnel-intake.log` or the notification.

## `generate-icons.ts`

Regenerates the committed raster icon set (`static/favicon.ico`,
`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) from the same mark as
`static/favicon.svg`. It has no dependencies — a small PNG encoder and a
supersampled shape rasterizer — so run it with `bun run icons` only after
changing the mark. See the `icons` task in the [build tasks reference](../docs/reference/build-tasks.md).
