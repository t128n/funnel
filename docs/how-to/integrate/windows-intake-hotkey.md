# Windows intake hotkey

Capture the text currently selected in a Windows app and stage it as a Funnel intake with a single global hotkey, without leaving the app or switching windows.

> **Status: work in progress — not yet verified working.**
> The scripts in `scripts/` are a scratchpad implementation. See [DEVELOPMENT.md](../../../scripts/DEVELOPMENT.md) for the current state, suspected failure points, and next steps.

## Prerequisites

- **Windows PowerShell 5.1** (`powershell.exe`). The shortcut targets `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` on purpose, because 5.1 is always present. Keep 5.1 as the supported target.
- **A running Funnel instance.** The helper defaults to the dev server at `http://localhost:5173` (`bun run dev`). It submits to `POST /api/intake`.

## Install

From the repository root:

```powershell
# install with the default hotkey (Ctrl+Alt+I)
powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1
```

This creates `Funnel Intake.lnk` under `%APPDATA%\Microsoft\Windows\Start Menu\Programs`, bound to the hotkey and running `scripts\intake.ps1` hidden. The shortcut must stay in the Start Menu for the hotkey to fire globally.

Then select text in Teams, Outlook, or anywhere else and press the hotkey.

```powershell
# a different combo
powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1 -Hotkey "Ctrl+Shift+I"

# remove it
powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1 -Uninstall
```

### Hotkey options and constraints

| Option     | Default      | Notes                                                                         |
| :--------- | :----------- | :---------------------------------------------------------------------------- |
| `-Hotkey`  | `Ctrl+Alt+I` | `.lnk` hotkeys only support `Ctrl+Alt+<key>` / `Ctrl+Shift+<key>` combos.      |
| `-Uninstall` | off        | Removes `Funnel Intake.lnk` from the Start Menu.                              |

- The `.lnk` hotkey only registers while the shortcut lives in the Start Menu (or on the Desktop).
- Windows may need a sign-out/in (or an Explorer restart) before a new `.lnk` hotkey registers.
- Another application may already own the combination — try `-Hotkey "Ctrl+Shift+I"`.
- A console may flash briefly on trigger; that is the hidden PowerShell host starting up.

### `-BaseUrl` and `-Source`

`scripts\intake.ps1` itself accepts two parameters:

| Parameter  | Default                  | Purpose                                                              |
| :--------- | :----------------------- | :------------------------------------------------------------------- |
| `-BaseUrl` | `http://localhost:5173`  | Funnel instance base URL. The helper appends `/api/intake`.          |
| `-Source`  | `""` (auto-detect)       | Provenance label; empty means detect from the foreground app.        |

The installed shortcut runs the script with no extra arguments, so it uses the default `-BaseUrl`. To target a different instance, run the script directly with `-BaseUrl`, or edit the shortcut's target arguments:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\intake.ps1 -BaseUrl https://funnel.example.com
```

## What the capture does

Selecting text then pressing the hotkey runs this pipeline inside `intake.ps1`:

1. Detect the foreground app (`GetForegroundWindow` + `GetWindowThreadProcessId`) and map it to `source` (`ms-teams`, `outlook`, or the lowercased process name).
2. Save the current clipboard text.
3. Put a unique sentinel string on the clipboard.
4. Send `Ctrl+C` to the foreground window via `keybd_event`.
5. Poll the clipboard for ~1.2 s until it changes away from the sentinel.
6. Restore the saved clipboard.
7. Map the selection to the payload.
8. `POST {BaseUrl}/api/intake` as UTF-8 JSON.
9. Show a Windows notification with the staged id, or the error.

The selection is mapped to the API payload as:

| Field    | Value                                                          |
| :------- | :------------------------------------------------------------- |
| `title`  | First non-empty line, whitespace collapsed, max 256 chars      |
| `body`   | The full selection, max 65536 chars                            |
| `source` | Detected app (`ms-teams`, `outlook`, …), else the process name |

### Clipboard behaviour and restoration limits

- The current clipboard text is **restored afterwards**.
- Windows' clipboard history is not cleared: the synthetic copy, and the restore, may each add an entry.
- **Non-text clipboard contents (images, files) cannot be restored.** After capture the clipboard is re-seeded with text only.
- If the clipboard held nothing, it is cleared to empty rather than restored.
- With no selection, nothing is submitted and the notification says so.
- `Get-Clipboard -Raw` is known to append a trailing newline on some Windows PowerShell versions; the sentinel comparison uses `.Trim()` for that reason.

## Logging

Everything is logged to **`%TEMP%\funnel-intake.log`**. Read it first when anything misbehaves. The fastest way to observe a run is to invoke the script directly in a console so output and errors are visible:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\intake.ps1 -BaseUrl http://localhost:5173
```

## Troubleshooting

Work down this checklist:

- [ ] **Is the Funnel instance actually up?** Try
      `curl http://localhost:5173/api/intake -Method Post -Body '{"title":"smoke"}' -ContentType application/json`
      or check the notification text.
- [ ] **Does the log show anything at all?** No entry means the hotkey never fired — a shortcut/hotkey problem, not a script problem. Confirm `Funnel Intake.lnk` is present under `%APPDATA%\Microsoft\Windows\Start Menu\Programs`, and try signing out and back in so Explorer picks up the registration.
- [ ] **Does the log show `no selection captured`?** That is a capture problem. Verify the target window (Teams/Outlook) itself has focus when you press the hotkey; synthetic `Ctrl+C` needs the focused window. Some WebView2-based Teams modes may not respond to a synthetic copy.
- [ ] **Does the log show a submit error?** Check the URL/port and the response detail. A `400` from the API carries a JSON body with `message`/`issues`.

Known unverified areas, from `scripts/DEVELOPMENT.md`:

- Hotkey registration may require a sign-out/in or Explorer restart.
- Notifications rely on a WinForms `NotifyIcon` balloon, which may not render reliably without a message pump.
- Corporate antivirus sometimes blocks synthetic keystrokes or `-ExecutionPolicy Bypass`; check AV logs if the script silently dies.
- `-WindowStyle Hidden` still spawns a `powershell.exe` that can flash briefly; a `wscript.exe` + `.vbs` launcher would avoid it (not implemented).

## Related

- [Intake API](./intake-api.md)
- `scripts/README.md` — end-user usage
- `scripts/DEVELOPMENT.md` — work-in-progress notes and next steps
- `scripts/intake.ps1`, `scripts/install-intake-shortcut.ps1`
