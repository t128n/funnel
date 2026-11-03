# funnel

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
