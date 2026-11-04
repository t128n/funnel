# Organization findings

Revision audited: `3d229791dadf073eab2c22302d1d59b3c421c81c`  
Server: http://127.0.0.1:3004 · Session: `ux-org`

## Finding: Epics and milestones tables overflow instead of adapting on tablet and mobile

- Route: `/epics`, `/epics/demo/funnel/10`, `/milestones`
- Component: `src/lib/components/epics/EpicList.svelte`, `src/lib/components/epics/EpicChildTable.svelte`, `src/routes/(app)/milestones/+page.svelte`
- Viewport: 768x1024, 390x844
- Theme: light, dark
- Category: responsive
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/organization/epics-list-tablet-dark-default.png`, `audit/ui-ux/screenshots/organization/epics-list-mobile-light-default.png`, `audit/ui-ux/screenshots/organization/milestones-list-mobile-light-default.png`, `audit/ui-ux/screenshots/organization/epics-detail-tablet-dark-default.png`
- Existing issue match: none

### Problem

The Epics list, the Epic child table, and the Milestones list keep every desktop column at every width and rely on the `.table-responsive` wrapper for horizontal scrolling. Nothing hides low-priority columns, nothing moves values into a metadata line, and nothing signals that columns are off-screen.

- `/epics` at 768px: the table is 1188px wide in a 742px region. Only Epic, Title, and part of Milestone are visible; Status, Progress, Estimate, Actual, and Delay are hidden.
- `/epics` at 390px: the table is 1198px wide in a 364px region. The epic title is clipped mid-word because the cell continues past the scroll edge.
- `/epics/demo/funnel/10` at 768px: the child table is 1127px wide in a 744px region. Status text is cut to “In prog”/“In revie”; Estimate, Actual, Delay, and the remove/actions column are unreachable without horizontal scrolling.
- `/milestones` at 390px: the table is 716px wide in a 364px region. The due date is clipped mid-value (“2026-12-1(”), and Progress and Created by are entirely off-screen. On a milestone list, progress is the column that makes the page useful.

Composition A §12 defines an explicit adaptation for wide lists: hide the ID/status/priority/assignee columns below `md`, move them into a secondary line under the title, and never make the reader scroll sideways for the primary content.

### Steps to reproduce

1. Open `http://127.0.0.1:3004/epics` at 768×1024 or 390×844.
2. Observe that only the first columns are visible and the title is cut at the viewport edge.
3. Scroll the table region horizontally; the page itself does not overflow, so there is no page-level scrollbar hint.
4. Repeat on `/milestones` and `/epics/demo/funnel/10`.

### Actual behavior

Eight-column tables render at their natural width inside a 364–744px viewport. Primary values (status, progress, due date) are off-screen or clipped, with no affordance.

### Expected behavior

At `md` and below, the organization lists keep a readable subset (for example Title + progress/due as a metadata line) and do not require horizontal scrolling to read status or progress. The child table either hides time columns or stacks them under the issue title.

### Impact

The organization views are effectively desktop-only. A tablet or phone user cannot see an epic's progress or a milestone's due date without discovering an unmarked horizontal scroll area, and clipped values look like broken data.

### Suggested direction

Apply the same responsive column strategy already required for the issue index: choose the two or three columns that carry the page (title, status, progress/due), hide the rest below `md`/`lg`, and render the hidden values as a compact metadata line under the title. For the epic child table, drop Estimate/Actual/Delay below `md` and keep the remove action reachable.

### Acceptance criteria

- [ ] `/epics` at 390px and 768px shows the title, status, and progress without horizontal scrolling.
- [ ] `/milestones` at 390px shows each milestone's due date and progress without clipping.
- [ ] The epic child table at 768px shows full status text and a reachable remove action.
- [ ] No table cell text is clipped mid-word at the right edge.

## Finding: Notification titles are truncated to a few characters on mobile

- Route: `/notifications`
- Component: `src/routes/(app)/notifications/+page.svelte`
- Viewport: 390x844
- Theme: light
- Category: responsive
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/organization/notifications-mobile-light-default.png`
- Existing issue match: none

### Problem

Each notification title shares a flex row with the relative time and the “Mark read” link. Both are `flex-shrink-0`, so the title (`min-w-0 text-truncate`) collapses to about 140px at 390px:

- “Priya commented on demo/funnel#1” → “Priya comme…”
- “You were assigned demo/funnel#4” → “You were ass…”
- “demo/funnel#4 is now P1” → “demo/funnel…”
- “New intake: Export the board to CSV” → “New intake:…”

The event type and target are partly recoverable from the meta line below, but the one-line summary that distinguishes the notifications is unreadable. There is no way to expand a title without opening the issue (which also marks it read).

### Steps to reproduce

1. Open `http://127.0.0.1:3004/notifications` at 390×844.
2. Compare the four unread titles with their desktop rendering.
3. Observe the ellipsis after 8–12 characters while “Mark read” and the timestamp retain full width.

### Actual behavior

The primary content of each row is truncated; secondary controls consume the row width.

### Expected behavior

On narrow screens the title wraps or owns its own line, and the timestamp/action move below it. Truncation may remain as a last resort but must not reduce the title to a few characters.

### Impact

Users cannot scan the notification feed on a phone; they must open each row to learn what happened, and opening marks it read, so the list is consumed by inspection.

### Suggested direction

At `xs`, stack the row: title first (wrapping to two lines), then a metadata line with time and “Mark read” (or an icon button with an accessible label). Keep the desktop single-line layout.

### Acceptance criteria

- [ ] At 390px, every notification title is readable in full or wraps to two lines.
- [ ] Time and read action no longer compete with the title for horizontal space.
- [ ] The desktop layout is unchanged.

## Finding: Epic status reads “Unconfirmed” on the detail page and “Open” on the list

- Route: `/epics/demo/funnel/10`, `/epics/demo/funnel/3`, `/epics`
- Component: `src/routes/(app)/epics/[owner]/[repo]/[number]/+page.svelte`, `src/lib/components/common/StatusText.svelte`, `src/lib/components/epics/EpicList.svelte`
- Viewport: 1440x900
- Theme: light, dark
- Category: visual consistency
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/organization/epics-detail-desktop-dark-default.png`, `audit/ui-ux/screenshots/organization/epics-detail-desktop-dark-empty.png`
- Existing issue match: none

### Problem

The epic detail header passes only `state` to `StatusText`. `StatusText` falls back to the literal “Unconfirmed” when `status` is null, so an open epic whose underlying issue is Backlog (`demo/funnel#10`) or Todo (`demo/funnel#3`) is labelled “Unconfirmed”. The Epics list maps the same state to `status="open"` and says “Open”. The issue detail for `demo/funnel#10` shows Status = Backlog.

“Unconfirmed” is triage vocabulary. On an epic it implies the epic itself has not been confirmed, which is not the state being represented and contradicts both sibling views.

### Steps to reproduce

1. Open `http://127.0.0.1:3004/epics/demo/funnel/10`.
2. Read the meta line under the title: the status is “Unconfirmed”.
3. Open `/epics`; the same epic's Status column says “Open”.
4. Open `/issues/demo/funnel/10`; the Properties status is Backlog.

### Actual behavior

Three views report three different status words for the same epic, one of which (“Unconfirmed”) is a triage concept.

### Expected behavior

The epic detail shows the same status as its issue (Backlog/Todo/…) or the same epic state as the list (Open/Closed). “Unconfirmed” is never used as a generic fallback.

### Impact

Users cannot tell whether an epic is simply open, needs triage, or has no status. The wording makes a normal Backlog epic look like an unresolved exception.

### Suggested direction

Pass the epic's real status to `StatusText` on the detail page, or render an explicit epic-state component shared with the list. Replace the `Unconfirmed` default with a neutral “No status” only where a status is genuinely absent.

### Acceptance criteria

- [ ] An open epic shows the same status word on `/epics` and its detail page.
- [ ] The detail status matches the issue's Properties status.
- [ ] “Unconfirmed” does not appear for a Backlog or Todo epic.

## Finding: Organization pages omit breadcrumbs and the epic detail has no way back to Epics

- Route: `/epics`, `/epics/demo/funnel/10`, `/milestones`, `/milestones/demo/funnel/1`, `/notifications`, `/attention`
- Component: route pages under `src/routes/(app)/{epics,milestones,notifications,attention}`
- Viewport: 1440x900
- Theme: light, dark
- Category: navigation/IA
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/organization/epics-detail-desktop-light-default.png`, `audit/ui-ux/screenshots/organization/epics-list-desktop-light-default.png`, `audit/ui-ux/screenshots/organization/milestones-list-desktop-dark-default.png`, `audit/ui-ux/screenshots/organization/myissues-desktop-light-default.png`
- Existing issue match: none

### Problem

`/issues` renders a `Workspace / Issues` breadcrumb, and `/issues?assignee=me` inherits it. The organization pages do not:

- `/epics`, `/milestones`, `/notifications`, and `/attention` have no breadcrumb.
- `/epics/demo/funnel/10` has no breadcrumb and no back link to the Epics list. The only in-app route back is More → Epics.
- `/milestones/demo/funnel/1` substitutes a right-aligned “← Milestones” link button for a breadcrumb; it works, but it is a different pattern from the rest of the app.
- `/notifications` is reachable only from the bell, so its lack of a breadcrumb is less costly, but it still has no page-trail anchor.

Composition A specifies a breadcrumb on every index and detail page (`Workspace / Epics`, `Workspace / Issues / FUN-58`).

### Steps to reproduce

1. Open `/issues` and note “Workspace / Issues” under the navbar.
2. Open `/epics` and `/epics/demo/funnel/10`; no breadcrumb is rendered.
3. On the epic detail, look for a link back to `/epics`; there is none.
4. Compare `/milestones/demo/funnel/1`, which uses the right-aligned back button instead.

### Actual behavior

Organization pages start directly with the heading. The epic detail is a navigation dead end apart from browser history or the More menu.

### Expected behavior

Every organization index and detail page carries the same Bootstrap breadcrumb as `/issues`, with the epic/milestone ref as the current item. Epic detail has a direct link back to Epics.

### Impact

Users lose their location in a deep organization page and cannot return to the parent list without using browser history or rediscovering the overflow menu. The inconsistency makes the app feel like two shells.

### Suggested direction

Add `Breadcrumb` + `BreadcrumbItem` to the organization routes: `Workspace / Epics / demo/funnel#10`, `Workspace / Milestones / v2.0 — cockpit`, `Workspace / Notifications`, `Workspace / Attention`. Replace the milestone back button with that breadcrumb.

### Acceptance criteria

- [ ] Each organization index shows `Workspace / <Section>`.
- [ ] Epic and milestone details show the parent section in a breadcrumb.
- [ ] The epic detail has a direct link to `/epics`.

## Finding: Epic list titles are not links and rows are not clickable

- Route: `/epics`
- Component: `src/lib/components/epics/EpicList.svelte`
- Viewport: 1440x900, 768x1024, 390x844
- Theme: light, dark
- Category: component behavior
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/organization/epics-list-desktop-light-default.png`, `audit/ui-ux/screenshots/organization/epics-list-mobile-light-default.png`
- Existing issue match: none

### Problem

In the Epics table the title cell is a plain `<span class="text-truncate">`. Only the small `demo/funnel#10` reference is an `<a>`, and the row has no click handler. Clicking the title — the largest and most conventional target — does nothing. On the sibling `/milestones` list the milestone title *is* a link, so two visually identical list pages behave differently. Composition A §7.4 makes the blue title the primary link and requires keyboard and middle-click navigation through it.

### Steps to reproduce

1. Open `http://127.0.0.1:3004/epics` at 1440×900.
2. Click the text “Epic: make the cockpit fast on a cold cache”.
3. Observe the URL remains `/epics`.
4. Click the small `demo/funnel#10` reference; the detail page opens.

### Actual behavior

The title is not interactive; only the reference is a link.

### Expected behavior

The epic title is a blue link to the epic detail (or the whole row is a real link), while the reference remains a secondary identifier. The link is focusable and middle-clickable.

### Impact

Users follow the standard “click the title” habit and get no response. On mobile the title looks like body text and the only target is a 12px reference, which also explains why the title is clipped rather than reachable.

### Suggested direction

Wrap the title in an anchor and keep the reference as plain text or a second link. Optionally make the row clickable with the title as the real link, following the `/issues` row pattern.

### Acceptance criteria

- [ ] Clicking an epic title opens its detail page.
- [ ] The title link has a visible focus state and supports middle-click.
- [ ] The Epics and Milestones lists use the same title-link convention.

## Finding: Milestone due dates have no overdue treatment

- Route: `/milestones`, `/milestones/demo/funnel/2`
- Component: `src/routes/(app)/milestones/+page.svelte`, `src/routes/(app)/milestones/[owner]/[repo]/[number]/+page.svelte`
- Viewport: 1440x900
- Theme: light, dark
- Category: feedback/state
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/organization/milestones-list-desktop-dark-overdue.png`, `audit/ui-ux/screenshots/organization/milestones-detail-desktop-dark-overdue.png`
- Existing issue match: none

### Problem

Milestone due dates are always rendered as plain `YYYY-MM-DD` text. There is no overdue style, icon, or word, even when the date is in the past and the milestone still has open work. With `Docs refresh` temporarily due 2026-10-20 and 1 of 6 issues closed, the list row and the detail meta line render exactly like the future-dated milestones around them. The Timeline view already computes `isOverdue` (due date in the past and progress < 1); the milestone views do not use it.

### Steps to reproduce

1. Set a milestone's `due_on` to a past date (the audit instance's `Docs refresh` was temporarily set to 2026-10-20; it was restored afterwards).
2. Open `/milestones` and `/milestones/demo/funnel/2`.
3. Compare the past-due row with the future-dated `v2.0 — cockpit` and `Reliability sprint` rows; all dates are styled identically.

### Actual behavior

An overdue milestone is visually indistinguishable from one that is months away.

### Expected behavior

A past due date with incomplete work is labelled “Overdue” with Bootstrap's danger text plus an icon, using the same text + icon convention as status and priority, and is consistent with the Timeline's overdue marking. Completed milestones are not marked overdue.

### Impact

The milestone list is the place to see schedule risk, yet a missed date carries no signal. Users must compare each ISO date against today's date mentally.

### Suggested direction

Reuse `isOverdue` from `src/lib/components/timeline/timeline-format.ts`. Render `Overdue · 2026-10-20` in `text-danger` with `bi-exclamation-circle` when due and incomplete; keep the plain date otherwise. Apply the same rule to the detail meta line.

### Acceptance criteria

- [ ] A past-due, incomplete milestone is visually distinct on the list and detail pages.
- [ ] The treatment uses text and an icon, not color alone.
- [ ] A completed milestone with a past due date is not marked overdue.
- [ ] The wording matches the Timeline's “Overdue” label.

## Finding: Notifications silently stop at 100 rows while the header counts every unread item

- Route: `/notifications`
- Component: `src/routes/(app)/notifications/+page.server.ts`, `src/routes/(app)/notifications/+page.svelte`
- Viewport: 1440x900
- Theme: dark
- Category: feedback/state
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/organization/notifications-desktop-dark-100cap.png`
- Existing issue match: none

### Problem

The loader calls `listNotifications(user.id, { limit: 100 })`, but `unreadNotificationCount` counts every unread row. There is no pager, “load more”, or “showing X of Y” footer. With 110 unread notifications the page showed:

- Header: “110 unread”, bell badge “99+”
- Unread section: 100 items
- Total rendered rows: 100

Ten unread notifications were counted but unreachable. “Mark all read” clears them, but a user cannot read or act on them individually.

### Steps to reproduce

1. Insert more than 100 notifications for the signed-in user (the audit added 110 temporary rows for `demo-user`).
2. Open `/notifications`.
3. Compare the header count with the number of rendered rows and the Unread section count.
4. Observe there is no pagination control or total/limit message below the list.

### Actual behavior

The page reports 110 unread and renders at most 100 rows, with older items inaccessible.

### Expected behavior

The list either paginates or loads more until every counted item is reachable, or it states “Showing 100 of N” with a way to continue. The displayed count and the list agree.

### Impact

Long-lived accounts accumulate notifications; unread items can silently disappear from the only notification view while the badge and header insist they exist. The user cannot audit or clear them individually.

### Suggested direction

Add pagination or a “Load older” control using the existing count, and show the result total below the list. Alternatively, scope the header count to the loaded window and link to the rest. Keep the current newest-first order.

### Acceptance criteria

- [ ] Every notification included in the unread count can be reached from the page.
- [ ] The list shows a total or a “showing N of M” line when capped.
- [ ] Marking all read clears the count and the list together.

## Finding: My Issues has no page identity, title, or visible active navigation

- Route: `/issues?assignee=me`
- Component: `src/routes/(app)/issues/+page.svelte`, `src/lib/components/shell/navigation.ts`, `src/lib/components/shell/AppBar.svelte`
- Viewport: 1440x900, 390x844
- Theme: light, dark
- Category: navigation/IA
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/organization/myissues-desktop-light-default.png`, `audit/ui-ux/screenshots/organization/myissues-mobile-light-default.png`, `audit/ui-ux/screenshots/organization/myissues-desktop-dark-default.png`
- Existing issue match: none

### Problem

The `My Issues` destination is `/issues?assignee=me`, and the page it opens is indistinguishable from a filtered Issues page:

- The `h1` is “Issues” and the description is “Every open issue in the current scope, grouped for scanning.”
- The document title is “Issues · Funnel”.
- The breadcrumb is `Workspace / Issues`.
- The navbar’s primary `Issues` link is intentionally *not* active for this URL, but `My Issues` lives in the More dropdown and the closed More toggle has no active styling. `aria-current="page"` exists only on the hidden menu item, so at a glance no destination is active.

The only on-screen evidence of the view is the assignee select reading “Assigned to me” and the “Clear 1 active filter” link. Because `My Issues` is a first-class navigation entry, the page contradicts its own label.

### Steps to reproduce

1. Open the More menu and choose “My Issues” (or open `/issues?assignee=me`).
2. Read the heading, description, document title, and breadcrumb.
3. Confirm that the primary navbar shows no active destination; open More and note that My Issues is active only inside the menu.

### Actual behavior

A destination named My Issues renders a generic Issues page with no view-specific heading or visible active state.

### Expected behavior

When `assignee=me`, the page identifies itself as “My Issues” (heading and description), and the active destination is visible in the navbar — at minimum an active indicator on the More toggle. The table and filters stay shared.

### Impact

Users arriving from My Issues cannot confirm they are in the promised view, and the page's description implies a broader scope than the rows shown. The view still works, so this is polish rather than a blocker.

### Suggested direction

Derive the heading/description from the active filter (`My Issues` / “Open issues assigned to you.”) while keeping `/issues` for the unfiltered view. Add an active class or dot to the More toggle when an overflow destination matches, and keep `aria-current` on the item.

### Acceptance criteria

- [ ] `/issues?assignee=me` shows a My Issues heading and a matching description and document title.
- [ ] The navbar exposes an active state at the top level when My Issues is selected.
- [ ] The unfiltered `/issues` page is unchanged.

## Finding: Milestone detail uses a second, inconsistent issue presentation

- Route: `/milestones/demo/funnel/1`
- Component: `src/routes/(app)/milestones/[owner]/[repo]/[number]/+page.svelte`, `src/lib/components/issue/IssueList.svelte`, `src/lib/components/issue/IssueRow.svelte`
- Viewport: 1440x900, 390x844
- Theme: light, dark
- Category: visual consistency
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/organization/milestones-detail-desktop-dark-default.png`, `audit/ui-ux/screenshots/organization/milestones-detail-mobile-light-default-retry.png`
- Existing issue match: none

### Problem

`/issues` uses `IssueTable` — the Composition A table with column headers, blue title links, and bordered label badges. The milestone detail page uses `IssueList`/`IssueRow`, the older two-line list:

- No column headers; status, priority, size, age, assignee, milestone, and labels are one free-flowing metadata line.
- Labels render as comma-separated plain text, not the bordered badges used on `/issues`.
- The title is body text; the row is a `role="button"` wrapper, so the affordance differs from the shared table.
- Every row repeats the milestone name (`v2.0 — cockpit`) because the row context always includes the milestone. On the milestone's own page this is redundant, and at 390px the context truncates to “v2.0 — co…”, so the labels that would follow it are unreadable.

The same data on two routes teaches two different scan patterns.

### Steps to reproduce

1. Open `/issues` and note headers, blue titles, and bordered labels.
2. Open `/milestones/demo/funnel/1` and compare the row anatomy.
3. At 390px, note that each row's context ends at “v2.0 — co…” and the repeated milestone name is visible on every row.

### Actual behavior

Milestone detail renders an older list style with no columns, plain-text labels, and a repeated milestone name.

### Expected behavior

Milestone detail uses the same issue table as `/issues` (or a deliberately aligned row style with badges and a title link). When the page is a milestone, its name is omitted from the per-row context.

### Impact

Moving from the issue index to a milestone resets the user's scanning model, labels lose their visual affordance, and the repeated milestone crowds out useful metadata on mobile.

### Suggested direction

Render the milestone's issues with `IssueTable` or align `IssueRow` with the table's label badges and link styling. Pass a context flag to suppress the milestone name on milestone pages.

### Acceptance criteria

- [ ] Milestone detail rows use the same title/label/status presentation as `/issues`.
- [ ] The milestone name is not repeated in every row on the milestone's page.
- [ ] Labels remain readable at 390px.

## Finding: Attention describes re-check dates with due-date language

- Route: `/attention`
- Component: `src/routes/(app)/attention/+page.svelte`, `src/lib/components/attention/AttentionRow.svelte`, `src/lib/attention.ts`
- Viewport: 1440x900, 390x844
- Theme: light, dark
- Category: feedback/state
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/organization/attention-desktop-light-default.png`, `audit/ui-ux/screenshots/organization/attention-desktop-light-unscheduled.png`
- Existing issue match: none

### Problem

Attention is a list of blocked issues grouped by when to check the blocker again. The UI never uses the word “re-check” in its group headings or dated rows:

- Groups are “Overdue”, “Due today”, “Upcoming 7 days”.
- Dated rows show “Overdue · Mon 2 Nov 2026”, which reads as the issue being overdue.
- The unscheduled row repeats itself: “No date · No re-check date”.
- The page has no visible one-line explanation (the description exists only in the document metadata); the only clue is the blocker text on the second line.

The underlying re-check semantics are explained in the code and the closed #24, but not on the page.

### Steps to reproduce

1. Open `/attention` at 1440×900.
2. Read the group headings and the first row: “Overdue · Mon 2 Nov 2026 · FUN-6”.
3. Clear a re-check date (Update block → empty date) and observe “No date · No re-check date”.
4. Note that nothing on the page says these dates are re-check dates.

### Actual behavior

Re-check deadlines are presented with due-date vocabulary and a duplicated “No date / No re-check date” label.

### Expected behavior

The page says what it is (“Blocked issues, grouped by when to re-check”) and the row/group labels use re-check language (“Re-check overdue”, “Re-check today”). The undated state uses one phrase.

### Impact

A user can misread a blocked issue as past due and prioritise it for the wrong reason. The duplicated undated label is noise but not harmful.

### Suggested direction

Add a visible description under the heading (“Blocked issues grouped by re-check date.”), rename the urgency labels to include “re-check”, and render “No re-check date” once in the date slot. Keep the existing bucket order and danger treatment.

### Acceptance criteria

- [ ] The page states that the buckets are re-check dates.
- [ ] Dated rows make clear the date is a re-check, not a due date.
- [ ] The unscheduled row shows one date label.

## Finding: The epic add-child flow uses secondary styling and implementation-first copy

- Route: `/epics/demo/funnel/10`
- Component: `src/routes/(app)/epics/[owner]/[repo]/[number]/+page.svelte`, `src/lib/components/epics/AddChildDialog.svelte`
- Viewport: 1440x900
- Theme: light, dark
- Category: bootstrap convention
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/organization/epics-detail-desktop-dark-default.png`, `audit/ui-ux/screenshots/organization/epics-detail-desktop-light-add-child-modal.png`
- Existing issue match: none

### Problem

- The page's only action, “Add child”, is a `<Button>` with no `color`, so Sveltestrap renders `btn btn-secondary` (gray fill). The modal's confirm button is the same. Bootstrap primary actions elsewhere in the app are blue (`Inbox` Accept is `btn-primary`), and Composition A reserves primary blue for the main action.
- Both buttons use the default `md` size (38px) while the rest of the page's controls follow the compact scale.
- The dialog copy reads “The full child list is written to the epic issue body.” and “Open issues that are not already in another epic.” The first sentence exposes storage implementation rather than what the user is doing.

### Steps to reproduce

1. Open `/epics/demo/funnel/10`.
2. Inspect the “Add child” button (computed background `rgb(108, 117, 125)`, class `btn-secondary`).
3. Open the dialog and read the description and the confirm button styling.

### Actual behavior

The main action is styled as a secondary button in a non-compact size, and the dialog explains the data model.

### Expected behavior

“Add child” and the modal confirm are `primary` small buttons (or `outline-primary` if the page should stay quiet), and the copy explains the task (“Choose an open issue to add to this epic.”) without mentioning the issue body.

### Impact

The hierarchy says “secondary” for the only action on the page, and the copy asks the reader to understand an internal representation. Both are small but visible in the primary epic workflow.

### Suggested direction

Use `color="primary" size="sm"` for the page action and modal confirm, and rewrite the dialog lead to a single task sentence. Keep the candidate list and search behavior.

### Acceptance criteria

- [ ] The page action and modal confirm use the primary button style at the compact size.
- [ ] The dialog copy describes the task, not where children are stored.
- [ ] The rest of the modal behavior is unchanged.

## Finding: Milestone detail has no entry point to add or remove issues

- Route: `/milestones/demo/funnel/1`
- Component: `src/routes/(app)/milestones/[owner]/[repo]/[number]/+page.svelte`
- Viewport: 1440x900
- Theme: light, dark
- Category: workflow
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/organization/milestones-detail-desktop-dark-default.png`
- Existing issue match: none

### Problem

The milestone detail page lists issues and progress but is otherwise read-only. To add an issue the user must already know to open that issue and use Properties → Milestone; to remove one, the same. There is no “Add issues” action, no row remove, and no explanatory line. The epic detail page, by contrast, has a prominent “Add child” action. Both are organization containers, so the difference is not self-evident.

### Steps to reproduce

1. Open `/milestones/demo/funnel/1`.
2. Look for any way to assign an issue to this milestone or remove one from it.
3. Find none; open an issue detail and confirm the Milestone select is the only entry point (set/clear verified there).

### Actual behavior

The milestone page cannot change its own membership.

### Expected behavior

Milestone detail offers an “Add issues” action (or at least a sentence explaining that membership is set from an issue's Properties), mirroring the epic's Add child. A remove action is optional but should be consistent with the epic child table.

### Impact

Users managing a release must discover an unrelated page to shape it, and the read-only milestone page looks incomplete next to Epics.

### Suggested direction

Add an “Add issues” button that opens a picker of unassigned/open issues and sets the milestone, or a short help line linking to the issue index with the milestone filter. Keep the existing table.

### Acceptance criteria

- [ ] A user can add an issue to a milestone from the milestone page, or is told exactly where to do it.
- [ ] The add flow matches the epic Add child pattern in placement and feedback.
- [ ] Removing membership is possible from the same surface or explicitly documented as issue-side.

## Finding: Milestone (and epic) detail 404s drop the app shell and expose sync wording

- Route: `/milestones/demo/funnel/999`, `/epics/demo/funnel/999`
- Component: `src/routes/+error.svelte`, `src/lib/components/common/ErrorState.svelte`
- Viewport: 1440x900
- Theme: dark
- Category: feedback/state
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/organization/milestones-detail-desktop-dark-404.png`
- Existing issue match: none

### Problem

Requesting a missing milestone renders a full-page centered error with no navbar or page header:

- “404 / Page not found / Milestone is not mirrored”. “Mirrored” is internal sync vocabulary.
- Actions are “Try Again” (the route will 404 again) and “Back to Issues” (the relevant list is Milestones).
- The epic variant says “Epic not found”, which is better copy but has the same missing shell and generic destination.

Composition A §11 requires the shell and page header to remain, a Bootstrap alert in the content region, no raw server messages, and a recovery path. The component comment says a full-page surface is deliberate because the shell's data is unavailable when its subtree fails; that explains the missing navbar, but not the internal wording or the wrong recovery destination.

### Steps to reproduce

1. Open `http://127.0.0.1:3004/milestones/demo/funnel/999`.
2. Observe the page has no navbar, no breadcrumb, and says “Milestone is not mirrored”.
3. Repeat with `/epics/demo/funnel/999`.

### Actual behavior

A bare error page leaks the sync model and offers a retry that cannot succeed.

### Expected behavior

The error explains in user terms that the milestone does not exist and links back to Milestones (and Epics for the epic route). If the focused surface must stay, keep it but fix the copy and destination. Retry is offered only when the failure is transient.

### Impact

A stale bookmark or mistyped URL strands the user outside the app's navigation and suggests a data-sync fault where the real answer is “this milestone was deleted or never existed”.

### Suggested direction

Map 404s to a human message (“This milestone does not exist.”) with a breadcrumb/back link to `/milestones` — inside the shell if it can be preserved, otherwise in the focused surface. Reserve “Try Again” for 5xx/transient failures. Remove sync vocabulary from user-facing copy.

### Acceptance criteria

- [ ] A missing milestone/epic either renders inside the normal navbar or uses the focused surface with a section-appropriate recovery link.
- [ ] The copy avoids sync/internal terms and offers the matching list as the primary action.
- [ ] “Try Again” is not shown for a 404.
