# DESIGN.md: Funnel application profile

Funnel uses **Bootstrap 5** as its visual foundation and
[**Sveltestrap**](https://sveltestrap.js.org) for Svelte component
abstractions. Icons come from **Bootstrap Icons**. The application follows the
approved **Composition A — Traditional Bootstrap Application**: one dark
global navbar, centered page containers, conventional tables and forms, and a
dedicated document page for every issue.

The Bootstrap CSS is loaded once in `src/routes/+layout.svelte`; application
layout rules that Bootstrap cannot express live in
[`src/lib/styles/app.css`](../src/lib/styles/app.css). Rendered Markdown prose
is styled in [`markdown.css`](../src/lib/styles/markdown.css).

The approved design contract lives in
[`docs/design/COMPOSITION-A.md`](./design/COMPOSITION-A.md) and the
current-to-target mapping in
[`docs/design/MIGRATION-MAP.md`](./design/MIGRATION-MAP.md).

## 1. Identity

- A compact dark Bootstrap navbar (`navbar-dark bg-dark`, `py-2`) is the only
  global navigation layer. It carries the brand, primary destinations, a
  `More` overflow menu, repository scope, search, notifications, theme, and the
  user menu.
- There is no persistent application sidebar and no split list/detail pane.
  The page is the unit of composition: index page, document page, inbox page.
- Page content sits in a centered Bootstrap container: `container-xl` for the
  issue index, Inbox, Matrix, Timeline, Milestones, Epics, Plan, Settings, and
  Notifications; `container-lg` for the issue document; `container-fluid` for
  the Board canvas that needs the width.
- Bootstrap's default system font stack and 1rem body size are retained.
- Structure comes from alignment, whitespace, and Bootstrap border utilities.
  Content is not wrapped in decorative cards or shadows.

## 2. Theme

Light and dark themes are driven by **`data-bs-theme`** on `<html>`, which
Bootstrap 5.3 uses for every component and CSS variable. The pre-paint script
in `src/app.html` and the theme controller in `src/lib/client/theme.ts` keep
`data-bs-theme` and `color-scheme` in sync. Persistence uses `localStorage`
under `funnel:theme` (`system`, `dark`, `light`).

Components must consume Bootstrap variables (`--bs-body-color`,
`--bs-secondary-color`, `--bs-border-color`, `--bs-primary`, `--bs-danger`,
`--bs-body-bg`, `--bs-tertiary-bg`, …) rather than hard-coded colours or
parallel theme attributes.

## 3. Components

Use Sveltestrap before raw Bootstrap markup:

| Need | Component |
| --- | --- |
| Action | `Button`, `ButtonGroup` |
| Form field | `FormGroup`, `Label`, `Input`, `FormFeedback`, `FormCheck`, `FormText` |
| Overlay | `Modal`, `ModalHeader`, `ModalBody`, `ModalFooter` |
| Drawer | `Offcanvas` |
| Menu | `Dropdown`, `DropdownToggle`, `DropdownMenu`, `DropdownItem` |
| Navigation | `Navbar`, `NavbarBrand`, `NavbarToggler`, `Collapse`, `Nav`, `NavItem`, `NavLink` |
| Data | `Table`, `ListGroup`, `ListGroupItem` |
| Surface | `Card`, `CardBody` |
| Feedback | `Alert`, `Badge`, `Progress`, `Spinner` |
| Disclosure | `Collapse`, `Fade` |

There is no Sveltestrap `Select` or `Textarea`; use Bootstrap
`<select class="form-select">` and `<textarea class="form-control">`.

Application-specific components (`IssueTable`, `IssueDetailPage`,
`IssuePropertiesCard`, `IssueDetailsCard`, `InboxTable`, `MatrixGrid`,
`StatusBoard`, `TimelineChart`) remain. They own domain behavior and compose
Sveltestrap internally; they are not a replacement design system. Plan is
composed directly from Sveltestrap tables in its route page.

The shared presentation components are `PageHeader`, `StatusText`,
`StatusIcon`, `PriorityText`, `PriorityIcon`, `InlineStatus`, `EmptyState`,
`RefText`, `IntakeTag`, `Avatar`, and `Spinner`. They are thin compositions of
Bootstrap markup and Sveltestrap; keep using them rather than duplicating their
markup.


## 4. Icons

Bootstrap Icons only:

```svelte
<Button color="primary">
  <i class="bi bi-plus-lg" aria-hidden="true"></i>
  New issue
</Button>
```

Icon-only controls need an accessible name (`aria-label` or `title` plus
`aria-label`). Decorative icons are `aria-hidden="true"`. Do not mix icon
libraries.

## 5. Layout

- **App shell**: one dark navbar (`py-2`, 56 px measured) followed by the page
  in normal document flow. No persistent sidebar, no fixed-height cockpit
  frame, no nested pane scrollers. The navbar collapses below `lg` with a
  one-layer Bootstrap `Collapse`; it never becomes an off-canvas global rail.
- **Issues index**: `container-xl py-4`, one toolbar row (search, status,
  priority, assignee, group), and a grouped six-column table inside a bordered
  `table-responsive` wrapper. Title is the remaining width and the widest
  column.
- **Issue detail**: `container-lg py-4` with an 8/4 split at `lg` and above
  (`col-lg-8` document and activity, `col-lg-4` Properties and Details cards).
  It stacks below `lg`, document first.
- **Inbox**: `container-xl py-4` with a conventional six-column table and
  inline Accept/Decline; no triage pane.
- **Settings**: `container-xl py-4` with a local `row g-4` page column
  (`col-lg-3` nav, `col-lg-9` content) and a `form-select` switcher below `lg`.
  This is local settings navigation, not a global sidebar.
- **Workspaces**: the board keeps flat 1px-bordered cards in horizontally
  scrollable `18rem` lanes and a `60svh` canvas; every drag has a keyboard and
  menu equivalent. The matrix is an interactive 3×3 selection grid inside
  `container-xl` with an assessment summary, a rating-guide dialog, and the
  selected cell's issues in the second column; issues missing an axis stay in
  the assessment queue. Plan is a conventional document view: a capacity table
  followed by scheduled, unassigned and unestimated tables, with no progress
  meters or dashboard cards. The timeline uses an
  `Apache ECharts` Gantt with an HTML label column, a real list of milestone
  links, and an undated table below the chart. The chart reads its palette from
  `--funnel-chart-*` (and Bootstrap colour variables) so it follows the theme.
  These layouts keep minimal scoped CSS because Bootstrap grid cannot express
  them.
- **Focused flows** (intake, login, onboarding): no app navigation, one
  centered `.form-measure` column, one primary action.

## 6. Tables, lists, and metadata

Priority is a derived `P1`–`P3` token shown as text (and a signal icon where
space is tight), never as a GitHub label. Index titles are ordinary blue links
with no underline; status and priority are icon + text, not coloured pills.
Identifiers and group counts are muted.

Use Sveltestrap `Table` with `hover align-middle` inside a
`table-responsive border rounded` wrapper. The header row is
`thead.table-light`; group headers are a full-width `tr.table-light` with
`th colspan="6"`. A small dark-mode bridge in `app.css` maps `.table-light`
onto Bootstrap's tertiary surface, so neither becomes a light-gray slab.
Below `md`, the issue index hides the ID/status/priority/assignee columns and
repeats them in a metadata line under
the title; the Inbox hides Issue/Source/Submitted and keeps its actions visible.
Metadata uses Bootstrap `dl`/`row` patterns or the shared `.property-list`.


## 7. Forms

- Every control has a `<Label for>`; helper text uses `FormText`.
- Invalid fields use `invalid`/`is-invalid` and `FormFeedback`.
- Keep existing validation messages, disabled states, and submission behavior.
- Do not wrap each settings section in a card. Use ruled sections
  (`settings/section.svelte`) and conventional form layout.

## 8. Interaction and accessibility

- Use Sveltestrap behavior for dropdowns, modals, offcanvas, collapse, fade,
  and tooltips; do not reimplement their state machines.
- Preserve keyboard behavior and focus management.
- Use Bootstrap's focus-visible treatment; add `aria-current="page"` to active
  navigation.
- Status is always icon + text; colour is a second channel.
- Respect `prefers-reduced-motion` through Bootstrap's transition defaults and
  avoid decorative animation.

## 9. Validation

Every change must pass `bun run check`, the relevant `bun test` files, and
`bun run build`. Verify light/dark themes, responsive layouts, keyboard
navigation, SSR, and hydration for interactive components.
