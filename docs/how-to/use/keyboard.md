# Keyboard shortcuts

This guide lists the keyboard shortcuts the cockpit actually binds and the extra navigation available on the board.

## Global shortcuts

`Mod` means `⌘` on macOS and `Ctrl` on other platforms. The cockpit displays the platform-appropriate form.

| Shortcut | Action | Where it applies |
| :--- | :--- | :--- |
| `Mod` + `K` | Open the command palette | Cockpit views; works even while typing in a field |
| `/` | Focus the current view's search field | Cockpit views; ignored while typing in a field |
| `Mod` + `,` | Open Settings | Cockpit views |
| `C` | Open the in-app **New issue** dialog | Cockpit views and issue lists, for `write` users only; ignored while typing |
| `Mod` + `B` | Toggle the sidebar | Cockpit views |
| `S` | Open the focused board card's status menu, or focus the focused list row's status control | Board and issue lists, for `write` users only |
| `X` | Open the focused board card's details, or toggle selection of the focused list row | Board and issue lists; selection is `write` only |

Details and conditions:

- **Command palette.** `Mod` + `K` opens the one palette above the page. It searches navigation commands (Inbox, Issues, Board, Attention, Plan, Timeline, Settings, and the rest of the navbar catalog), saved views, and issues. Arrow keys move through commands and results, `Enter` opens the focused item, and `Escape` closes the palette and returns focus to whatever opened it. With an empty query, `Enter` opens the first recent issue; pressing `ArrowDown` first moves into the command list.
- **Search.** `/` focuses the current view's search field. If the current view has no search field — Attention, for example — it does nothing. `Mod` + `K` still fires inside an input; the bare `/` does not, so you can type a slash in a title or comment.
- **New issue.** `C` is registered only for users with the `write` role. It opens the in-app create dialog (repository, title, description, status, priority, size, assignees and labels) rather than navigating to `/intake`. The `/intake` form remains the external submission path. The board's per-column **New Issue** control and the palette's **Create issue** command open the same dialog.
- **Settings.** `Mod` + `,` navigates to `/settings`.
- **Sidebar.** `Mod` + `B` toggles the sidebar. On narrow screens the sidebar is presented as a sheet, also opened with the cockpit's menu trigger.
- **Focus.** `S` and `X` act on the board card or list row that currently has keyboard focus. `S` on a list focuses that row's inline status control (Inbox Triage, or the Issues status select), and does nothing for a row without one. `X` on a list toggles the shared bulk selection; on the board it opens the card.

The search trigger shows a `Mod` + `K` hint while the modifier is held. The board header's keyboard button opens a legend for the board-specific shortcuts.

## Command palette

The palette is the same surface as issue search, so it never opens a second overlay.

| Key | Action |
| :--- | :--- |
| `Mod` + `K` | Open the palette |
| `↑` / `↓` | Move through commands and issue results |
| `Home` / `End` | Jump to the first or last item |
| `Enter` | Run the focused command or open the focused issue |
| `Escape` | Close the palette and restore focus |

Read-only (`read`) users see navigation and saved-view commands plus issue search. **Create issue** is absent, and list shortcuts for selection, status, and creation do nothing.

## Issue and Inbox lists

Both tables share one roving tab stop: Tab enters at the focused row (or the first row), and the title link is the row's keyboard stop. The checkboxes and inline controls keep their normal native behaviour.

| Key | Action |
| :--- | :--- |
| `J` / `↓` | Focus the next row (clamps at the last) |
| `K` / `↑` | Focus the previous row (clamps at the first) |
| `Home` / `End` | Focus the first or last row |
| `Enter` | Open the focused row |
| `X` | Toggle the focused row in the bulk selection (`write` only) |
| `S` | Focus the focused row's status control (`write` only) |
| `C` | Open quick-create (`write` only) |
| `Escape` | Clear the selection and return focus to the row link |

The list shortcuts are ignored while typing in a text field, textarea, select, or contenteditable region. Row focus changes and selection toggles are announced through a polite status region.

## Board navigation

The board has one roving tab stop, so Tab enters at the currently active card rather than stepping through every card.

| Key | Action |
| :--- | :--- |
| `↑` / `↓` | Move focus to the previous or next card in the same lane |
| `←` / `→` | Move to the nearest non-empty lane in that direction |
| `Space` | Start a keyboard drag on the focused card |
| Arrow keys | Move the card while a keyboard drag is active |
| `Space` | Drop the card while a keyboard drag is active |
| `Enter` | Open the focused card's details |
| `X` | Open the focused card's details |
| `S` | Open the focused card's status menu |

When moving left or right, Funnel keeps the card's position where the target lane is long enough and clamps to the target lane's last card otherwise. Empty lanes are skipped. While a drag is active, the drag library owns the arrow keys and the normal card navigation is suspended.

Opening a card navigates to its detail route and docks the inspector; the board itself stays behind it. Opening the status menu gives you the same **Move to** choices as the pointer-driven card menu, including Done and the structured close flow.

## Composer and editor shortcuts

These are local to the focused form, not global shortcuts.

| Context | Shortcut | Action |
| :--- | :--- | :--- |
| `/intake` composer | `Mod` + `Enter` | Submit the staged submission |
| `/intake` title field | `Enter` | Move focus to the description instead of submitting |
| Inspector description editor | `Mod` + `Enter` | Save the description |
| Comment / work note composer | `Mod` + `Enter` | Submit the current comment or note |

The intake form relies on the browser's required-field validation for the title; the comment and work-note send buttons stay disabled while the draft is empty.

## Context matters

Shortcuts are registered by the layout that owns them, so the same key is not global in every sense:

- `C` exists only inside the signed-in cockpit and only for `write` users.
- `S` and `X` act on the focused board card or list row; on the board, `S` opens the status menu and `X` opens the details.
- `Mod` + `,` and `Mod` + `B` belong to the cockpit shell; the public `/intake` page and the login page do not have the sidebar or settings shortcut.
- Bare keys such as `C`, `J`, `K`, and `/` are suppressed while you are typing, while modifier shortcuts still work.
- `Escape` closes the command palette and clears a list selection. There is no `?` help overlay; use the board's keyboard legend button for the board-specific map.

## Related

- [Use the board](board.md)
- [Create and edit issues](create-and-edit-issues.md)
- [Triage intake submissions](triage-intake.md)
- [The workflow model](../../explanation/workflow-model.md)
