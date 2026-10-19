# Keyboard shortcuts

This guide lists the keyboard shortcuts the cockpit actually binds and the extra navigation available on the board.

## Global shortcuts

`Mod` means `⌘` on macOS and `Ctrl` on other platforms. The cockpit displays the platform-appropriate form.

| Shortcut | Action | Where it applies |
| :--- | :--- | :--- |
| `Mod` + `K` | Focus the issue search | Cockpit views; works even while typing in a field |
| `/` | Focus the issue search | Cockpit views; ignored while typing in a field |
| `Mod` + `,` | Open Settings | Cockpit views |
| `C` | Start a new issue by opening `/intake` | Cockpit views, for `write` users only; ignored while typing |
| `Mod` + `B` | Toggle the sidebar | Cockpit views |
| `S` | Open the focused board card's status menu | Board only |
| `X` | Open the focused board card's details | Board only |

Details and conditions:

- **Search.** `Mod` + `K` and `/` both focus the search input. If the current view has no search field — Attention, for example — Funnel navigates to `/issues` first and then focuses the search there. `Mod` + `K` still fires inside an input; the bare `/` does not, so you can type a slash in a title or comment.
- **New issue.** `C` is registered only for users with the `write` role. It opens the `/intake` composer rather than a modal create form. The sidebar's **New issue** button is disabled for `read` users.
- **Settings.** `Mod` + `,` navigates to `/settings`.
- **Sidebar.** `Mod` + `B` toggles the sidebar. On narrow screens the sidebar is presented as a sheet, also opened with the cockpit's menu trigger.
- **Focus.** `S` and `X` act on the board card that currently has keyboard focus. With no focused card they do nothing.

The search input shows a `Mod` + `K` hint while the modifier is held. The board header's keyboard button opens a legend for the board-specific shortcuts.

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
- `S` and `X` exist only on `/board` and its detail routes.
- `Mod` + `,` and `Mod` + `B` belong to the cockpit shell; the public `/intake` page and the login page do not have the sidebar or settings shortcut.
- Bare keys such as `C` and `/` are suppressed while you are typing, while modifier shortcuts still work.

The current cockpit does not bind `Escape` to clear a selection, and there is no `?` help overlay. Use the inspector's close button, select another row, or use the board's keyboard legend button.

## Related

- [Use the board](board.md)
- [Create and edit issues](create-and-edit-issues.md)
- [Triage intake submissions](triage-intake.md)
- [The workflow model](../../explanation/workflow-model.md)
