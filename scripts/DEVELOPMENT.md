# Funnel Intake hotkey — development notes

> **Status: WORK IN PROGRESS — not working yet.**
> This file is the scratchpad for picking the tool back up later. It records what
> exists today, what is known/untested, and where to start next time.
> For end-user usage see [README.md](./README.md).

## Goal

Select text in Microsoft Teams / Outlook (or anywhere), press a global hotkey,
and have that text staged as a Funnel intake via `POST /api/intake` — without
leaving the app or switching windows.

## Current design (as implemented)

Pipeline inside `intake.ps1`:

1. Detect the foreground app (`GetForegroundWindow` + `GetWindowThreadProcessId`)
   → used as the `source` field.
2. Save the current clipboard text.
3. Put a unique sentinel string on the clipboard (`Set-Clipboard`).
4. Send `Ctrl+C` to the foreground window via `keybd_event` P/Invoke.
5. Poll the clipboard for ~1.2 s until it changes away from the sentinel.
6. Restore the saved clipboard.
7. Map `title` = first non-empty line (≤256), `body` = full selection (≤65536),
   `source` = detected app.
8. `POST {BaseUrl}/api/intake` as UTF-8 JSON.
9. Show a WinForms `NotifyIcon` balloon with the id or the error.

## Files

| File | Purpose |
| :--- | :--- |
| `intake.ps1` | Capture + submit. Runs hidden from the hotkey. |
| `install-intake-shortcut.ps1` | Creates/removes the Start Menu `.lnk` with hotkey. |
| `README.md` | End-user usage. |
| `DEVELOPMENT.md` | This file — work-in-progress notes. |

## How to install / trigger

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1
# then select text and press Ctrl+Alt+I
powershell -ExecutionPolicy Bypass -File scripts\install-intake-shortcut.ps1 -Uninstall
```

Requires the Funnel dev server on `http://localhost:5173` (`bun run dev`).

## Debugging checklist (start here next time)

Everything the script does is logged to **`%TEMP%\funnel-intake.log`** — read it
first. Fastest way to observe a run is to invoke the script directly in a
console so output/errors are visible:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\intake.ps1 -BaseUrl http://localhost:5173
```

Then work down this list:

- [ ] Is the Funnel dev server actually up? `curl http://localhost:5173/api/intake -Method Post -Body '{"title":"smoke"}' -ContentType application/json` (or check the notification text).
- [ ] Does the log show anything at all? No entry ⇒ the hotkey never fired (shortcut/hotkey problem, see below), not a script problem.
- [ ] Does the log show `no selection captured`? ⇒ capture problem (clipboard/keystroke), see below.
- [ ] Does the log show a submit error? ⇒ check the URL/port/response detail.

### Open questions / suspected failure points

These are the things most likely to be wrong and have **not been verified on a
real machine yet**:

1. **Hotkey not firing.**
   - `.lnk` "Shortcut key" only works while the shortcut lives in the Start Menu
     or on the Desktop. Confirm `Funnel Intake.lnk` is present under
     `%APPDATA%\Microsoft\Windows\Start Menu\Programs`.
   - Windows may need a sign-out/in (or Explorer restart) to register a new
     `.lnk` hotkey.
   - Another app may already own `Ctrl+Alt+I`; try `-Hotkey "Ctrl+Shift+I"`.

2. **Clipboard capture.**
   - `keybd_event`/`SendKeys` Ctrl+C needs the target window focused; verify
     Teams/Outlook itself has focus when you press the hotkey.
   - `Get-Clipboard -Raw` is known to append a trailing newline in some Windows
     PowerShell versions — harmless, but the sentinel comparison uses `.Trim()`
     for this reason.
   - Some apps (WebView2-based new Teams in certain modes) may not respond to a
     synthetic Ctrl+C, or may copy rich content we read as plain text.
   - Non-text clipboard content (image/file) cannot be restored after capture.

3. **Console flash / hidden launch.**
   - `-WindowStyle Hidden` still spawns a `powershell.exe` that can flash briefly.
     A `wscript.exe` + `.vbs` launcher would avoid it entirely (not done).
   - `-WindowStyle Hidden` + `NotifyIcon` balloon may not render reliably without
     a message pump; if notifications don't show, fall back to a different
     feedback mechanism (see below).

4. **Antivirus / ExecutionPolicy.**
   - Corporate AV sometimes blocks synthetic keystrokes or `-ExecutionPolicy Bypass`.
     Check AV logs if the script silently dies.

5. **Windows PowerShell 5.1 vs PowerShell 7.**
   - The shortcut targets `powershell.exe` (5.1, always present) on purpose. If
     run under `pwsh`, `Get-Clipboard` behaviour is the same but COM/STA details
     may differ. Keep 5.1 as the supported target.

## Ideas / next steps (not committed)

- [ ] Decide on the feedback mechanism: reliable Windows toast
      (`Windows.UI.Notifications` via a PS module) vs. the current balloon.
- [ ] Optional flash-free launch via a generated `.vbs` wrapper run by `wscript.exe`.
- [ ] Optional `-SourceHotkey` / multiple shortcuts (e.g. one that always uses a
      fixed `source`).
- [ ] Optional edit dialog before submit (rejected for v1 in favour of silent capture).
- [ ] Config for `BaseUrl` (currently a hard-coded default in the shortcut args) —
      could read from an env var or a small config file next to the script.
- [ ] A "test capture" mode that prints the derived title/body/source instead of
      submitting, for faster iteration.
- [ ] Consider whether "create an intake" should instead create a GitHub issue
      directly — the current implementation intentionally stages into the Funnel
      triage queue and requires an Accept step (see `docs/SPEC.md` §6).

## Repo references

- `src/routes/api/intake/+server.ts` — endpoint + valibot schema (title ≤256,
  body ≤65536, `201 { id }`, `400 { message, issues[] }`, no auth, open CORS).
- `static/openapi.yml` — published contract (kept in sync by `tests/openapi.test.ts`).
- `docs/SPEC.md` §6 — intake & staging pipeline.
- `scripts/README.md` — user-facing usage.
