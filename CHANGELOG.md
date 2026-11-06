# funnel

## 0.0.12

### Patch Changes

- b93de89: Fix issue hydration so closed issues are mirrored as closed. `AssignedEvent.assignee` and `UnassignedEvent.assignee` are the `Assignee` union, so selecting `login`/`avatarUrl` directly made GitHub reject the entire timeline hydration query. Every poll then failed before writing the new issue state, leaving closed issues reported as open indefinitely. The query now selects each union member through an inline fragment, with a regression test that pins the union-safe query shape.
- 96c71e9: Let the onboarding wizard create the App on GitHub Enterprise Server. Enter `github.com` or a host such as `acme.ghe.com`; Funnel derives and stores the web and API hosts with the App credentials and uses them for manifest conversion, REST and GraphQL calls, links, and OAuth endpoints.
- 96c71e9: Make Funnel polling-only. Remove the inbound GitHub webhook receiver, its manifest hook and event subscriptions, the generated webhook secret, the `state_webhook_delivery` table, and the `FUNNEL_GITHUB_WEBHOOKS` opt-in. Onboarding no longer depends on GitHub being able to reach the server, and polling remains the single sync path.

## 0.0.11

### Patch Changes

- 9146549: Add configurable attention rules at `/settings/attention` for first response, stale open, re-check and waiting thresholds. Enabled rules surface breaches on `/attention` and notify linked assignees through the existing notification center; `0` disables a rule, defaults preserve existing behaviour, and no schema migration or per-repository overrides are required.
- cea76b0: Add multi-select and bulk triage to the issue streams and the Inbox. Rows gain checkboxes (plus Space on the focused checkbox and `x` on a focused row), with select-all for the loaded window and a compact action bar. Issues support bulk status, impact/urgency, size, assignee, label and snooze changes; staged submissions support bulk dismiss with the required reason and bulk snooze. Writes reuse the existing per-item paths through a bounded three-at-a-time runner, so partial failures are reported with the failing references while successful writes stay applied. Selection is keyed by `owner/name#number` and submission id, survives SSE refreshes, and clears after a successful action or navigation.
- 748aafd: Turn the Mod+K search panel into a command palette and add keyboard navigation to the issue lists. The palette searches navigation destinations, saved views, and issues in one place, with arrow/Home/End/Enter movement and Escape focus return; navigation and search stay available to read-only users while the create command is writers-only. Issue and Inbox rows gain a shared roving tab stop: `j`/`k` or the arrows move between rows, `Enter` opens, `x` toggles bulk selection, `s` focuses the row's status control, `c` opens quick-create, and `Escape` clears the selection. The Issues table shows an inline status select for writers, focus changes and selection toggles are announced to screen readers, and the new bindings come from the shared hotkey catalog.
- 5c63a33: Manage the public comment lifecycle on an issue. Authors can edit and delete their own GitHub comments (admins can delete any comment), with GitHub remaining authoritative for permissions and clear errors on refusal. Comments gain reaction chips and a picker for the standard GitHub reactions, backed by an additive mirror summary and durable per-user viewer state. The composer autocompletes `@logins` from the repository's assignable users and inserts the mention at the caret. Comment writes stay separate from internal work notes, and every change is applied optimistically and reconciled by the normal single-issue refresh.
- f0d7cb7: Add unassigned (`assignee=none`) and blocked filters to the issue streams, plus selectable priority, updated, created and title sorting with an asc/desc direction that survives reloads and shared links.
- 52bea80: Add an optional GitHub webhook receiver at `POST /api/github/webhooks`. The App manifest now subscribes to issue, comment, pull-request, review and check events and registers the hook URL so GitHub generates a webhook secret during onboarding. Deliveries are verified with HMAC-SHA-256 over the raw body, capped at 5 MiB, deduplicated by `x-github-delivery` in the new additive `state_webhook_delivery` table, and refresh only the affected issues (at most 20 per delivery). Polling remains enabled and unchanged as the repair path for missed or deleted events. Settings reports whether a webhook secret is configured, and Apps created before this change can be recreated or reconfigured to opt in.
- 9367aff: Add Inbox snooze/defer for staged submissions and untriaged issues. A snooze hides a row until a resurface time and automatically returns it when due; issues are keyed by `owner/name` plus number so snoozes survive mirror pruning and re-sync. The Snoozed view offers resurface, the queue badge excludes snoozed rows, and triage or a status change clears the snooze.
- 1debef0: Add a read-only Insights view at `/insights` with repository and UTC date-range filters. It reports inbox age, time to first triage, time to close, daily throughput, WIP, stale waiting and backlog aging, with documented definitions, empty-data handling and no new dependencies.
- 4d815d9: Add configurable per-IP intake rate limits and a honeypot to `POST /api/intake` and the `/intake` form. Throttled API calls return `429` with `Retry-After`, the form keeps the draft, and rejected attempts never stage a submission or log content. The three new `intake.*` settings default to 10 per minute, 60 per hour and honeypot enabled; `0` disables a rate window. The limiter is in-process and relies on SvelteKit's trusted client address, so a reverse proxy must configure `ADDRESS_HEADER`/`XFF_DEPTH`.
- da1d783: Add a unified issue activity history. GitHub timeline events (labels, assignments, close/reopen, references, mentions, renames and milestones) are mirrored from the existing batched hydration query inside the configured history window, while Funnel also records local priority, label and assignee changes alongside the existing status/state/blocked log. The issue Activity section gains All, Comments and History filters, merged in chronological order without duplicating comments or showing the same change twice, and intake-accepted issues show a "Created from intake" entry.
- 9f44fa6: Show the milestone's due date and closed state in an issue's read-only Properties, with overdue dates in red and an em dash when the issue has no milestone.
- 765fd4e: Mirror GitHub parent/sub-issue and blocked-by/blocking relationships in the new disposable `mirror_issue_relation` table. Hydration uses two separate fail-soft GraphQL queries so a GitHub Enterprise host that rejects sub-issues or dependencies keeps its previously stored edges and never fails the issue sync. The issue Inspector now shows the parent, sub-issue progress computed from the mirrored children, and blocked-by/blocking lists, kept visually separate from Funnel's manual blocked flag. Each query keeps at most 100 edges per issue, and the main hydration query is unchanged.
- 2400c28: Mirror GitHub issue types (Bug/Feature/Task) into the disposable `mirror_thread.issue_type` column through a separate fail-soft GraphQL query. The issue Inspector shows the type, the issue lists can filter by type (including untyped) and group by type, and quick-create offers a Type select when the selected repository supports it. Unsupported hosts/repos keep syncing and creating issues normally, and a rejected type write never turns a successful create into a failure.
- a0cef4d: Make the reserved-label vocabulary configurable with a global `labels.prefix` setting. Provisioning, sync, filters, writes, HTTP shortcuts and the cockpit all derive from the configured vocabulary while logical keys, URLs and API values stay stable.
- 435cb41: Mirror the pull requests linked to an issue, with open/draft/merged/closed state, reviewer verdicts, and the head commit's check rollup. The issue detail gains a compact Development panel, while list rows and board cards show a small PR/check indicator. Two opt-in Sync settings can move an open issue to In Review when a PR opens and close it when every linked PR is merged or closed. The GitHub App manifest now requests `pull_requests: read` and `checks: read`; existing installations must approve the added permissions.
- bf20368: Add a supported Linux bare-metal path alongside `funnel setup`: a checked-in
  systemd unit and environment template under `packaging/systemd/`, a root-only
  `install.sh` helper that delegates to the existing wizard, and a how-to covering
  service-account setup, config, reverse proxy, health probes, upgrades, backups,
  uninstall, hardening, and troubleshooting. The automated wizard remains the
  recommended installer.
- b8033a4: Add an in-app quick-create issue dialog. `C` and the board columns' **New Issue** control now open a dialog with repository, title, description, status, impact, urgency, size, assignee and non-reserved label fields; creating posts through the existing issue API, refreshes the cockpit, and shows a confirmation with the GitHub link. `/intake` remains the external submission path.
- e8cca18: Add named, shareable saved views for the Issues and Inbox streams. The new **Views** toolbar switcher saves the current filter query, sort, direction and grouping as a preset; choosing one opens the stored URL and restores its grouping. Views can be personal or shared instance-wide, pinned, refreshed from the current filters, renamed and deleted. The URL remains the source of truth and later filter edits are not auto-saved; read-only users can open views but cannot create or change them.
- c68fcc2: Add FTS5 issue search over titles, bodies and comments, with `#123`/`FIT-123`/`owner/repo#123` identifiers and constraining `is:`, `label:`, `repo:`, `status:` and `assignee:` qualifiers in the shared `q` parameter. The index is maintained by the mirror write path and backfilled by an additive migration.
- e3119bc: Show per-repository sync health in Settings → Sync, including the last poll and nightly reconciliation times, a degraded-state banner, and an administrator-only **Sync now** action that runs one cycle and refreshes the table. The last error stays in the sync worker's structured log rather than a new database column.
- 4956ab3: Complete Inbox triage decisions. Accept can set status, labels and assignees; dismiss requires a free-text reason and can be undone; duplicate records its target. Submissions are archived instead of hard-deleted, and an append-only `state_triage_event` table keeps the decision history across archival.
- 788101f: Add a first-class waiting state for issues parked on the reporter, a vendor or an upstream project. An issue can be marked waiting with a fixed reason, an optional note and re-check date; the state is stored locally in `state_issue_waiting`, keyed by `owner/name` + number, so it survives mirror pruning and never edits the GitHub body. Waiting issues get their own section in Attention, with a stale badge after seven days and one-click clearing, and the Inspector and Inbox gain matching controls and a `waiting=true|false` filter.

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
