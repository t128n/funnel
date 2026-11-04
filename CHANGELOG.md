# funnel

## 0.0.10

### Patch Changes

- f772bce: Paint the skip link above the navbar when focused, and raise dark-mode
  secondary controls, success/danger text, and the composer shortcut hint above
  the 4.5:1 contrast threshold.
- 64744ac: Describe Attention dates as re-check dates: the page states the grouping, bucket and row labels say "Re-check", and an undated row shows "No re-check date" once.
- 4bd23de: Remove moved cards from the source board lane immediately instead of waiting for a reload.
- 1868e54: Fix the board card-actions menu being clipped by the lane scroller, and fit the board canvas to the viewport instead of a fixed 60svh box.
- 1a1bf35: Bring the app icon, raster icons, web manifest theme colour and offline error page onto the current brand blue `#0060df`, and align the manifest splash background with the app's dark body. The `in-progress` GitHub label keeps its existing colour because it is a synced repository label.
- d0022de: Move focus into every dialog, trap Tab inside it, expose it as a modal, and
  return focus to the control that opened it.
- 69417ba: Keep error and not-found surfaces inside the app navigation, use plain-language
  per-section copy, and remove recovery actions that cannot succeed.
- e50b75a: Mark the intake title as required, route empty and whitespace submissions through
  the same persistent inline error, and show the staged submission reference on
  success.
- e948dc9: Use one absolute date format on issue detail: re-check dates read like the index, and delay start/end share the same formatted timestamp with the precise value in a tooltip.
- e21fb88: Put search and the primary issue filters in one predictable toolbar, label the long-tail drawer, identify the My Issues view, and announce each priority's token exactly once.
- fd0e1ff: Keep the issue index title readable at tablet width, keep label badges on the title line, and make each row a single keyboard stop.
- 6b1bb84: Keep Inbox triage on the queue after accepting or dismissing a submission, refresh
  the queue after a detail-page decision, and show a neutral no-match state instead
  of the "Inbox is clear" success when a search filters out waiting items.
- b0ad4f1: Put the Properties and Details rail before the conversation below `md` so status, assignee, and milestone are reachable without scrolling the whole issue, and add a Properties jump link on tablet widths.
- 76ef060: Add one global search surface to the navbar and Mod+K, remove the redundant repository-scope control, close the mobile menu after every navigation, make navbar dropdowns keyboard-operable, show an active state on the More toggle for overflow destinations, restore the dark navbar boundary, and keep one labelled clear control in search fields.
- 37e5a37: Keep notification titles readable on phones, expose every counted notification past the first 100, and separate blocked from workflow status so status cells always match their issue and filter.
- 64744ac: Give organization pages a consistent labelled breadcrumb: Epics, Milestones, Notifications and Attention index/detail pages now share `Workspace / Section / current`, and every breadcrumb uses one `aria-label="breadcrumb"` wrapper.
- 1dce8ab: Make the epic and milestone tables readable at every width, use the shared issue table on milestone detail, add a writer-only Add issues picker on milestones, and promote the epic Add child action to a compact primary button with task-focused dialog copy.
- 607a339: Show planned issues that have no size as committed-but-unestimated work on the weekly plan instead of claiming the week is empty.
- 291e802: Guard unsaved settings edits, make validation failures visible and actionable, show the active choice in the appearance theme radios, align the board WIP labels with the Board's status vocabulary, and give Projects and People distinct section headings.
- d60be30: Simplify weekly planning and remove the daily planner. `/plan` is now a conventional Bootstrap document with a page heading, previous/next week buttons, a capacity table, a scheduled-issues table, an unassigned section only when relevant, and an unestimated table with an **Estimate** action. The old lane/progress-bar composition and the `/day`, availability, day-plan and calendar-feed surfaces are removed. The four legacy daily-planning tables remain in existing databases but are no longer read or written.
- e948dc9: Keep the Properties status select on the issue's real value after a cancelled close or reopen, and make inline title editing an explicit Save/Cancel form with a hint and saved feedback.
- f45b430: Make Matrix cell selection visible on mobile: fit all three urgency columns at stacked widths and scroll/focus the selected-cell detail after a tap or keyboard selection.
- c49b243: Stop timeline milestone labels clipping and overlapping at desktop and tablet widths by sizing every label row to its tallest content and keeping the chart bands in sync.

## 0.0.9

### Patch Changes

- b91e0a3: Fix re-running `funnel setup` and `funnel uninstall` over an existing portable installation. An empty value in `funnel.env` is now read as empty, so `FUNNEL_URL=` no longer resolves to the next comment line (which opened a bogus `# 32-byte encryption secret .../onboarding` URL on Windows). Setup stops the previous process before writing the new manifest, so the port is actually released, and reports the process log when the replacement exits immediately instead of waiting 45 seconds for a health check. Uninstall now finds processes still running the installed image when the manifest PID is missing, retries and moves aside a binary that Windows still has mapped (instead of failing with `EFAULT`), and leaves locked leftovers for the next run. The browser opener also refuses non-HTTP values.

## 0.0.8

### Patch Changes

- ba958ac: Make weekly planning a property of the issue. The **Planned** picker now lives in the issue Properties panel, the Issues table and board cards show the committed week, and the Issues filter can scope to planned or unplanned work. `/plan` is a single-week capacity view; the cycle and milestone horizons are removed, and the personal ALPEN day moved to its own `/day` page. Old `/plan?horizon=day` links redirect to `/day`.

## 0.0.7

### Minor Changes

- 000be08: Migrate the entire interface from the custom Tailwind/shadcn-svelte design system to Bootstrap 5, Sveltestrap, and Bootstrap Icons. All routes keep their workflows and data contracts; the UI shell, forms, tables, dialogs, menus, and icons now use the established library components.
- 20a9164: Add the cross-platform `funnel setup` installer and lifecycle commands (`status`, `logs`, `uninstall`, `doctor`, `upgrade`) with systemd, launchd, and WinSW service support, configurable paths, automatic elevation, configurable data/log locations, and a Clack-based interactive UI.
- ed0839a: Redesign the Matrix view into an assessment and priority workspace: a live
  needs-assessment summary with an inline review queue, a selectable 3×3
  impact × urgency grid that shows only classified work, and a readable issue
  list for the selected cell.

### Patch Changes

- 1b6e289: Show the size/estimate control in the issue inspector's triage strip so unestimated issues can be sized without opening the collapsed Details section.
- bb68f85: Keep the values in settings fields after saving. The enhanced form no longer resets itself on success, which used to blank client-rendered inputs even though the changes had been saved.
- b18288e: Fix the Plan page's Schedule Issue dialog overflowing horizontally. The dialog now uses the 40rem wide dialog size and truncates long issue titles instead of stretching its content past the dialog edge.

## 0.0.6

### Patch Changes

- e4a8230: Fix the Windows setup wizard reporting a false failure after a successful portable or service installation. If you used the 0.0.5 wizard, stop the already-started `funnel.exe` before retrying.

## 0.0.5

### Patch Changes

- 41863a9: Add a Windows setup wizard that creates `.env` from `.env.example`, validates the port and public URL, installs the service or starts a portable copy, and preserves an existing `FUNNEL_SECRET`.

## 0.0.4

### Patch Changes

- eb9e756: Add the read-only milestone timeline with the Apache ECharts Gantt chart, accessible milestone column, and sidebar entry.

## 0.0.3

### Patch Changes

- 840528a: Fix onboarding form submissions and state cookies when Funnel is opened directly over HTTP, including `http://127.0.0.1:3000`.

## 0.0.2

### Patch Changes

- 1877831: Add Changesets v3 release automation, fix standalone executable asset streaming so bundled CSS and fonts load, and ship `.env.example` in release archives.
