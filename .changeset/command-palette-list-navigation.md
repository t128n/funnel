---
"funnel": patch
---

Turn the Mod+K search panel into a command palette and add keyboard navigation to the issue lists. The palette searches navigation destinations, saved views, and issues in one place, with arrow/Home/End/Enter movement and Escape focus return; navigation and search stay available to read-only users while the create command is writers-only. Issue and Inbox rows gain a shared roving tab stop: `j`/`k` or the arrows move between rows, `Enter` opens, `x` toggles bulk selection, `s` focuses the row's status control, `c` opens quick-create, and `Escape` clears the selection. The Issues table shows an inline status select for writers, focus changes and selection toggles are announced to screen readers, and the new bindings come from the shared hotkey catalog.
