# DESIGN.md: Funnel application profile

Funnel uses **Bootstrap 5** as its visual foundation and
[**Sveltestrap**](https://sveltestrap.js.org) for Svelte component
abstractions. Icons come from **Bootstrap Icons**. The application is an
issue cockpit: content-first, information-dense, and visually restrained.

The Bootstrap CSS is loaded once in `src/routes/+layout.svelte`; application
layout rules that Bootstrap cannot express live in
[`src/lib/styles/app.css`](../src/lib/styles/app.css). Rendered Markdown prose
is styled in [`markdown.css`](../src/lib/styles/markdown.css).

## 1. Identity

- A compact dark Bootstrap navbar (`navbar-dark bg-dark`) spans the top.
- A light secondary sidebar (`bg-body-tertiary`) carries navigation with
  standard Bootstrap `nav-pills`.
- The content canvas is fluid and uses Bootstrap typography, spacing, tables,
  forms, buttons, badges, and alerts.
- Bootstrap's default system font stack and 1rem body size are retained.
- Structure comes from alignment, whitespace, and Bootstrap border utilities.
  Content is not wrapped in decorative cards or shadows.

## 2. Theme

Light and dark themes are driven by **`data-bs-theme`** on `<html>`, which
Bootstrap 5.3 uses for every component and CSS variable. The pre-paint script
in `src/app.html` and the theme controller in `src/lib/client/theme.ts` keep
`data-bs-theme`, `data-theme`, and `color-scheme` in sync. Persistence uses
`localStorage` under `funnel:theme` (`system`, `dark`, `light`).

Components must consume Bootstrap variables (`--bs-body-color`,
`--bs-secondary-color`, `--bs-border-color`, `--bs-primary`, `--bs-danger`,
`--bs-body-bg`, `--bs-tertiary-bg`, …) rather than hard-coded colours or
`[data-theme]` selectors.

## 3. Components

Use Sveltestrap before raw Bootstrap markup:

| Need | Component |
| --- | --- |
| Action | `Button`, `ButtonGroup` |
| Form field | `FormGroup`, `Label`, `Input`, `FormFeedback`, `FormCheck`, `FormText` |
| Overlay | `Modal`, `ModalHeader`, `ModalBody`, `ModalFooter` |
| Drawer | `Offcanvas` |
| Menu | `Dropdown`, `DropdownToggle`, `DropdownMenu`, `DropdownItem` |
| Navigation | `Nav`, `NavItem`, `NavLink` |
| Data | `Table`, `ListGroup`, `ListGroupItem` |
| Feedback | `Alert`, `Badge`, `Progress`, `Spinner` |
| Disclosure | `Collapse`, `Fade` |

There is no Sveltestrap `Select` or `Textarea`; use Bootstrap
`<select class="form-select">` and `<textarea class="form-control">`.

Application-specific components (`IssueList`, `IssueRow`, `InspectorPane`,
`EisenhowerMatrix`/`MatrixGrid`, `StatusBoard`, `TimelineChart`, `DayPlan`,
`PlanLanes`) remain. They own domain behavior and compose Sveltestrap
internally; they are not a replacement design system.

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

- **App shell**: dark navbar (`3rem` minimum), light sidebar (`15rem`), fluid
  main column.
- **Master–detail**: `SplitView` keeps a `26rem` feed column above 992px and
  shows one surface at a time below it. The detail pane is capped at `48rem`
  for reading; `DetailShell` owns that measure.
- **Settings**: light secondary navigation (`12.5rem`) above 992px, a
  `form-select` switcher below it, and conventional form groups in a
  `40rem`–`50rem` content column.
- **Workspaces**: the board keeps `18rem` lanes; the matrix is a fixed-layout
  table; the timeline uses an `Apache ECharts` canvas with an HTML label column
  and an undated table. The chart reads its palette from `--funnel-chart-*`
  (and Bootstrap colour variables) so it follows the theme. These layouts keep
  minimal scoped CSS because Bootstrap grid cannot express them.
- **Focused flows** (intake, login, onboarding): no navigation, one centered
  column, one primary action.

## 6. Tables, lists, and metadata

Priority is a derived `P1`–`P3` token shown as text (and a signal icon where
space is tight), never as a GitHub label. Status, priority, and metadata use
Bootstrap badges, muted text, and icons.

Use Sveltestrap `Table` with `table-sm align-middle funnel-table` inside
scrollable regions. Dense feeds may use Bootstrap utilities plus a scoped grid
for the ref/title/meta/action columns. Metadata uses Bootstrap `dl`/`row`
patterns or the shared `.property-list`.

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
