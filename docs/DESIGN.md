# DESIGN.md: Funnel application profile — t128n

Funnel uses the **t128n** design language. The canonical values live in
[`src/lib/styles/tokens.css`](../src/lib/styles/tokens.css); the bridge to
shadcn-svelte and Tailwind lives in
[`theme.css`](../src/lib/styles/theme.css). This document is the application
profile: how Funnel applies t128n to an issue cockpit. The full redesign plan
and screen-by-screen decisions are in
[`plans/2026-11-02-t128n-redesign.md`](plans/2026-11-02-t128n-redesign.md).

Where this profile and the t128n specification disagree, accessibility and
task comprehension win; record the deviation here.

## 1. Identity

Funnel is a precision instrument for triage and planning. It is calm, dense,
and legible under pressure. Structure comes from alignment, whitespace, and
1px `border-subtle` rules. It does not use decorative cards, gradients, or
shadows on content.

- One accent: `--color-primary` in content, `--color-accent-on-dark` on the app
  bar. Selection is a 2px primary leading bar, never a blue fill.
- The app shell has a 3rem dark app bar, a 15rem `surface` sidebar, and a fluid
  canvas.
- Focused flows (intake, login, onboarding) use a centered column, no
  navigation, and one primary action.

## 2. Colour

Components consume namespaced roles, never raw hex.

| Role | Use |
| --- | --- |
| `--color-canvas` | Page background |
| `--color-surface` | Sidebar, zebra rows, quiet blocks |
| `--color-surface-2` | Table headers, hover, disabled |
| `--color-surface-3` | Selected vertical navigation |
| `--color-border-subtle` | Structural rules |
| `--color-border-strong` | Inputs and controls |
| `--color-text-primary` | Body and headings |
| `--color-text-secondary` | Metadata, labels, supporting copy |
| `--color-text-muted` | Placeholders and helper text |
| `--color-primary` | Action, focus, selection, current state |
| `--color-error` / `--color-warning` / `--color-success` | Status text and icons |

Status is always **icon + word**. Colour is a second channel, never the only
one. The only solid status fill is the danger button (`error` with
`on-error`). Text selection uses `--color-selection`.

## 3. Typography

Geist Sans for UI and prose; Geist Mono only for refs, identifiers, code, and
aligned numerals.

| Role | Size | Weight | Use |
| --- | --- | --- | --- |
| Caption | 0.75rem | 400/600 | Metadata, table headers, helper text |
| Body | 0.875rem | 400/600 | App UI, table cells, navigation |
| Body content | 1rem / 1.6 | 400 | Issue and comment prose |
| Heading sm | 1.25rem / 1.3 | 600 | Section headings, dialog titles |
| Heading md | 1.5rem / 1.25 | 600 | Page title |
| Mono | 0.8125rem | 400 | Refs, identifiers; 0.75 in cells |

Title Case for names (page titles, buttons, nav, table headers); sentence case
for descriptions, errors, and statuses. No all-caps. No type below 0.75rem.

## 4. Density and shape

The cockpit uses the **Default** control height: 2.25rem controls and 2.25rem
rows. Dense toolbars, row actions, menus, and icon utilities may use the 1.75rem
compact height where that is the operational density. Focused flows use 2.25rem
controls and 2.75rem rows. Below 768px, controls and rows are at least 2.75rem.

- Controls and tags: `--radius-sm` (0.125rem).
- Menus, popovers, lanes: `--radius-md` (0.25rem).
- Dialogs and drawers: `--radius-lg` (0.375rem).
- Avatars and status dots: `--radius-full` only.
- Shadows exist only on menus (`--shadow-raised`) and dialogs/drawers
  (`--shadow-overlay`). Never on cards, rows, inputs, or buttons.

## 5. Shell

- **App bar** (3rem, dark in both themes): menu on mobile, wordmark, workspace
  context, search, notifications, theme toggle, account menu. Focus uses
  `accent-on-dark`.
- **Sidebar** (15rem, `surface`): Personal (Inbox, My Issues, Notifications,
  Attention) and Workspace (Issues, Board, Matrix, Plan, Epics, Milestones),
  then Settings. Items are 1rem Lucide icons + labels + counts. Selected =
  `surface-3` + 2px primary leading bar + 600. No icon rail.
- **Mobile**: the sidebar becomes a bits-ui Sheet below 1024px; split views
  show one route at a time with a back link.
- Every app screen has a skip link, one `main` landmark, and one `h1`.
- Page header: h1 1.5rem/600, optional 0.875 secondary description capped at
  72ch, primary action right-aligned.

## 6. Lists and tables

- Table header 2.25rem on `surface-2`, 0.875/600, left-aligned.
- Rows 2.25rem, zebra `surface`, hover `surface-2`, 1px rule below the header
  only. No row borders.
- Selected rows use the 2px primary leading bar and keep 400 weight.
- Lists (Attention, Notifications, Activity) use 1px rules and no zebra.
- Sort state is an icon plus a label change, never colour alone.
- Row actions appear on hover/focus and are always in a menu.
- Virtualize lists above roughly 50 rows; keep the header outside the scroller.

## 7. Issue page

- Title 1.5rem/600; ref mono + GitHub link; status/priority/assignee line. Priority renders as P1–P3 with an accessible name.
- Properties are label–value rows under a top rule. Values are buttons that
  open the existing pickers and render as plain text at rest.
- Description and comments use 1rem/1.6 prose, max 72ch, with the shared
  Markdown styles.
- Activity is a ruled list, not chat bubbles. Internal work notes use
  `surface` and a lock icon + “Internal”; no reporter tint.
- Work notes and attachments sit inline after Activity. The composer is at the
  end of the pane with Comment/Internal note, attachment, primary submit, and
  a ⌘ Enter hint.
- Read-only viewers see text, not a wall of disabled controls.

## 8. Board, matrix, and plan

- Board lanes are scrollable containers with 1px `border-subtle`, surface
  headers, WIP counts, and icon+text over-cap warnings. Cards are canvas with
  1px borders, no shadow. Drag, keyboard move, and a menu-based move are all
  supported.
- Matrix is a real table; the rating guide is a dialog. Cells show a priority
  token + name and tabular count, not colour alone.
- Plan lanes are ruled sections, not cards. Capacity bars use `surface-2` track
  and `primary` fill; over-cap adds an error icon + text. Day plans use full
  ALPEN words, hour rules, and a 2px primary leading edge on blocks.

## 9. Focused flows

Intake, login, and onboarding have no app bar/sidebar. One column, 25–40rem,
one primary action. Errors are inline and tied to fields. Success replaces the
form with the result and its next action. Loading labels end with `…`.

## 10. Feedback and motion

- Inline is the default: field errors under fields, outcomes beside the action,
  failures in the region they affect with a Retry.
- Floating toasts are reserved for global background events (SSE disconnect,
  browser-notification errors) and are never the only record of an outcome.
- Hover 120ms, expand/view 180ms, overlays 240ms; exits are faster. Row and
  focus states change instantly. Honor `prefers-reduced-motion`.
- No stacked dialogs. A flow that needs two is a page.

## 11. Adding a surface

- Import `tokens.css`/`theme.css` through `global.css`; never add a second
  token layer.
- Use `PageHeader`, `Toolbar`, `StatusText`, `PriorityText`, `RefText`,
  `InlineStatus`, and `EmptyState` before inventing local variants.
- Use `#lib/components/ui/*` (bits-ui wrappers) for primitives; feature code
  must not import bits-ui directly.
- Add a missing dimension to `tokens.css` first, then consume it.
- Check both themes, keyboard order, 320px, 200% text, reduced motion, and
  forced colors before calling the surface done.
