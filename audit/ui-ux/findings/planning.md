# Planning findings

Revision audited: `3d229791dadf073eab2c22302d1d59b3c421c81c`  
Server: http://127.0.0.1:3003 · Session: `ux-planning`

## Finding: Board card actions menu is covered by the lane's cards and cannot be used

- Route: `/board`
- Component: `src/lib/components/board/BoardCard.svelte`, `src/lib/components/board/BoardColumn.svelte`
- Viewport: 1440x900 (also at 768x1024 and 390x844)
- Theme: light and dark
- Category: component behavior
- Suggested priority: P1
- Screenshot: `audit/ui-ux/screenshots/planning/board-desktop-light-card-menu.png`
- Existing issue match: none

### Problem

Clicking the three-dots control on a card opens a dropdown that is painted beneath the following cards in the same lane. Only the “Move to…” heading and the first item are partly visible; every actionable item is covered by the next card. `elementFromPoint` at each item's centre returns the following card/title/meta, not the menu item, and a pointer click on “In Review” is refused by the browser because the element is covered. The menu therefore cannot move, assign, block, close, or open a card with the mouse. The card's click-to-open still works, but the only visible in-board action surface is non-functional.

The menu also does not close on Escape while it is open (focus remains on the `Issue actions` trigger and `.dropdown-menu.show` stays in the DOM), so the stuck menu can linger behind other UI such as the Done dialog. Clicking elsewhere is the only way to dismiss it.

### Steps to reproduce

1. Open `/board` at 1440x900 in either theme.
2. Click the `⋯` button on the FUN-7 card in Todo (`Issue actions`).
3. Try to click “In Review” or “Close issue”.

### Actual behavior

The menu is clipped to roughly the first 70px and the remaining items sit behind the cards below. Clicking them lands on the next card instead.

### Expected behavior

The actions menu renders above all lane content and the lane scroller, fully visible and clickable. Bootstrap dropdowns should flip/escape scroll containers rather than be clipped by them.

### Impact

Assign, block, close, and open-details actions are unreachable with a pointer from the board's only action menu. Keyboard users can still focus the covered items, but they cannot see what they are focusing, so the actions are unreliable either way until the card is opened on its own page.

### Suggested direction

Render the menu in a portal/fixed-position layer (`strategy: fixed` with the reference element, or append to `body`) and raise its stacking context above the virtualized cards. Do not rely on the lane's `overflow-y` container for dropdown placement. Add a regression check that every menu item is hit-testable.

### Acceptance criteria

- [ ] The card menu is fully visible and not clipped by the lane or covered by any card.
- [ ] Move to, Assign to me, Block/Unblock, Close/Reopen, and Open details are all clickable by pointer.
- [ ] The `S` shortcut menu works with keyboard focus and Escape returns focus to the card.
- [ ] Escape closes the open menu as well as returning focus.
- [ ] Verified at 1440x900, 768x1024, and 390x844 in both themes.

---

## Finding: Board moves leave the moved card in its source lane until reload

- Route: `/board`
- Component: `src/lib/components/board/StatusBoard.svelte`, `src/lib/components/board/BoardColumn.svelte` (Virtua virtualization)
- Viewport: 1440x900
- Theme: light
- Category: component behavior
- Suggested priority: P1
- Screenshot: `audit/ui-ux/screenshots/planning/board-desktop-light-after-drag.png`, `audit/ui-ux/screenshots/planning/board-desktop-light-keyboard-move-duplicate.png`
- Existing issue match: none

### Problem

After a card is moved to another lane, the source lane keeps rendering the moved card. The lane header count updates correctly, but the card list does not, so the same issue appears in two lanes and the count disagrees with the visible cards. This happens for both pointer drag-and-drop and the Space/arrow keyboard move. Reloading the page removes the stale copy.

Measured after dragging FUN-7 from Todo to In Review: Todo header says `2`, but three cards render (PLT-6, FUN-14, FUN-7), and FUN-7 also renders at the top of In Review. The keyboard move of FUN-3 from Todo to In Progress produced the same duplicate until reload.

### Steps to reproduce

1. Open `/board`.
2. Drag FUN-7 from Todo onto the In Review lane.
3. Wait for the optimistic state and SSE refresh (2s).
4. Read the Todo header and count the rendered cards.

### Actual behavior

Todo shows `2` but renders three cards, including the moved FUN-7; FUN-7 is also in In Review.

### Expected behavior

The source lane removes the card immediately; the header count always equals the rendered card count.

### Impact

The board shows contradictory data after every move. The stale duplicate is interactive, so a user can open or drag the wrong copy and issue a second unintended state change. Users who trust the lane count will miss that a card did not actually leave.

### Suggested direction

Invalidate the virtualized source lane when the local lane arrays are reseeded, rather than only updating the count. Keep stable keys (`repo#number`) and ensure Virtua's data list is replaced, not mutated in place. Cover the remove path for both pointer and keyboard moves in a component test.

### Acceptance criteria

- [ ] After a drag, the moved card appears only in the destination lane.
- [ ] After a keyboard move, the moved card appears only in the destination lane.
- [ ] Each lane header count equals the number of rendered cards at all times.
- [ ] Reload is not required to reconcile the lanes.

---

## Finding: Board canvas is pinned to 60svh, leaving dead space and clipping the lane edge (reproduces #100)

- Route: `/board`, `/board?view=backlog`
- Component: `src/routes/(app)/board/+page.svelte` (`.board-canvas`)
- Viewport: 1440x900, 768x1024
- Theme: light and dark
- Category: responsive
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/planning/board-desktop-light-default.png`, `audit/ui-ux/screenshots/planning/board-backlog-desktop-light-default.png`, `audit/ui-ux/screenshots/planning/board-tablet-dark-default.png`
- Existing issue match: #100

### Problem

`.board-canvas` is fixed at `height: 60svh`. At 1440x900 it starts at y≈184 and ends at y≈724, so ~176px of the viewport below the board is empty, while the In Progress lane's scroll window ends at y≈720 and cuts the last card (FUN-6) mid-row. The lane's own scrolling works (#14 is not regressed), but the fixed canvas makes the board look cropped at an arbitrary line rather than fitted to the screen. At 768x1024 the canvas is 614px and the page leaves the same dead band below.

The Backlog view reuses the same 540px canvas for a four-row list: the rows end around y≈380, followed by a large empty bordered box and a “4 issues” footer. This is the same fixed-height cause, not a separate layout.

### Steps to reproduce

1. Open `/board` at 1440x900.
2. Measure the canvas bottom and the page height, or simply observe the empty area below the lanes and the half-visible last In Progress card.
3. Switch to Backlog and observe the oversized bordered region under the four rows.

### Actual behavior

Canvas bottom ≈724 of 900; lanes scroll inside 506px bodies; last In Progress card is visually cut at the canvas edge; Backlog ends in a large empty bordered box.

### Expected behavior

The board content fills the remaining viewport height (`100dvh` minus app bar, header, and toolbar), lanes scroll internally, the column header stays fixed, and the final card is reachable by lane scrolling. The Backlog list should size to its content instead of inheriting the board canvas height.

### Impact

The board wastes a quarter of the viewport and looks truncated at the bottom. Because the lane scrollbar is not visible until scrolling, the cut card reads as unreachable content. The Backlog list looks broken below four rows.

### Suggested direction

Make the page/content region a flex column at viewport height on `/board` and give the canvas `flex: 1 1 auto; min-height: 0` instead of `60svh`. Apply the canvas height only to the board view; let the Backlog `IssueList` size naturally.

### Acceptance criteria

- [ ] App bar + page header + toolbar + canvas fill `100dvh` with no dead band below.
- [ ] Each lane scrolls internally; the last card in every lane is reachable and not clipped at the canvas edge.
- [ ] Backlog is not rendered inside a fixed 60svh box.
- [ ] Works at 1440x900, 768x1024, and 390x844 in both themes.

---

## Finding: Dialogs open without moving or trapping focus

- Route: `/board` (Done close dialog), `/matrix` (Assessment queue, Rating guide)
- Component: `src/lib/components/issue/IssueActionDialog.svelte`, `src/lib/components/matrix/AssessmentQueue.svelte`, `src/routes/(app)/matrix/+page.svelte` (Rating guide `Modal`)
- Viewport: 1440x900, 390x844
- Theme: light and dark
- Category: accessibility
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/planning/board-desktop-light-done-dialog.png`, `audit/ui-ux/screenshots/planning/matrix-desktop-dark-assessment-queue.png`, `audit/ui-ux/screenshots/planning/matrix-mobile-light-rating-guide.png`
- Existing issue match: none

### Problem

Opening these dialogs does not move focus into the dialog, and the page behind remains in the tab order. With the Done dialog open, `document.activeElement` is `<body>`; pressing Tab focuses the next board card behind the dialog. The Assessment queue leaves focus on the “Review queue” button, and the Rating guide leaves it on “Rating Guide”. A keyboard user has to tab through every background control before reaching the dialog.

### Steps to reproduce

1. Open `/board`, drag a card into Done, wait for the Close issue dialog.
2. Check the focused element; press Tab.
3. Repeat with `/matrix` → “Review queue” and “Rating Guide”.

### Actual behavior

Focus stays on the trigger/card behind the dialog. Tab continues through the board/page instead of entering the dialog. The background is not inert.

### Expected behavior

Focus moves to the dialog (first field or close button), is trapped inside while open, background content is not tabbable, and Escape closes the dialog and returns focus to the trigger.

### Impact

Keyboard and screen-reader users can operate the dialog only by tabbing through all background content first; some will not discover it is open at all. This affects every planning dialog built on the shared Modal.

### Suggested direction

Use the project's existing `focusTrap` helper (already used by `FilterPopover`) or native `<dialog>`/Bootstrap focus management; mark the dialog `aria-modal`, set initial focus explicitly, and restore the trigger's focus on close.

### Acceptance criteria

- [ ] Opening each dialog moves focus into it.
- [ ] Tab and Shift+Tab cycle only within the dialog.
- [ ] Escape closes and returns focus to the invoking control.
- [ ] Background cards/buttons are not reachable while a dialog is open.

---

## Finding: Plan exposes only the week horizon; cycle and milestone modes silently redirect

- Route: `/plan`, `/plan?horizon=cycle`, `/plan?horizon=milestone`, `/day`
- Component: `src/routes/(app)/plan/+page.server.ts`, `src/routes/(app)/plan/+page.svelte`
- Viewport: 1440x900, 768x1024, 390x844
- Theme: light and dark
- Category: navigation/IA
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/planning/plan-desktop-light-week.png`, `audit/ui-ux/screenshots/planning/plan-desktop-dark-week.png`
- Existing issue match: none

### Problem

The approved migration map preserves the Week/Cycle/Milestones/Day planning modes and the plan header should be a single row with those view tabs. The current page is a single week view. `/plan?horizon=cycle` and `?horizon=milestone` return 307 redirects to `/plan`, and Day is only a “My day” link in the page header. There is no tab or view switcher, and no way to inspect cycle or milestone capacity.

### Steps to reproduce

1. Open `/plan` and look for the planning view tabs.
2. Open `/plan?horizon=cycle` and `/plan?horizon=milestone`.
3. Observe the URL after redirect and the header.

### Actual behavior

Both horizon URLs redirect to `/plan` (current week). The only alternate view is the “My day” link, which navigates to a separate page with no shared switcher.

### Expected behavior

A conventional Bootstrap tab or button-group switcher for Week / Cycle / Milestones / Day, preserving the selected date when switching; or a documented product decision to retire those modes, with the redirects removed and the migration map updated.

### Impact

Users cannot review multi-week or milestone-scoped capacity, a core planning job in the approved design. Shared “cycle” links silently land on the current week, so the user may not notice they are seeing a different horizon than the link promised.

### Suggested direction

Restore the four-mode switcher as a Bootstrap `Nav`/`NavTabs` or `ButtonGroup` (as the Board/Backlog switcher already does). Route cycle and milestone horizons to their own filters; keep Day as a tab that links to `/day`. If the modes were intentionally retired, update `docs/design/MIGRATION-MAP.md` and remove the dead redirects.

### Acceptance criteria

- [ ] A visible Week/Cycle/Milestones/Day switcher exists in the plan header row.
- [ ] Each mode is reachable without editing the URL.
- [ ] Switching modes keeps the current anchor/date where meaningful.
- [ ] Old horizon URLs either resolve to the matching mode or are removed with documented intent.

---

## Finding: Plan has no schedule/add-issue action for writers

- Route: `/plan`
- Component: `src/routes/(app)/plan/+page.svelte`, `src/lib/components/plan/PlanLanes.svelte`
- Viewport: 1440x900, 390x844
- Theme: light and dark
- Category: workflow
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/planning/plan-desktop-light-week.png`, `audit/ui-ux/screenshots/planning/plan-desktop-light-two-assignees.png`
- Existing issue match: none

### Problem

The plan page has no primary action to commit work to the week. The only header action is “My day”; the instruction says “Set Planned on an issue to commit it to a week”, forcing the user to leave `/plan`, find the issue, and use its Properties panel. The empty state offers “Browse issues”, but once any work is planned there is no add control at all. This conflicts with the planning specification that every horizon exposes an “add issue” control for writers and with the migration map's “Keep Schedule Issue as primary action”.

### Steps to reproduce

1. Open `/plan` with writer permissions.
2. Look for a “Schedule issue”/“Add issue” action in the page header or lanes.
3. Try to add another issue to the week without navigating away.

### Actual behavior

No add/schedule control exists in either the empty or populated state.

### Expected behavior

A primary “Schedule issue” button in the header (or a per-lane Add) opens a picker of sized, unplanned issues and commits the selected one to the current week, with success feedback and the capacity update.

### Impact

Planning is a read-only review surface unless the user already knows the hidden property path. The most important planning action is undiscoverable from the planning page.

### Suggested direction

Add a stock `Button color="primary"` “Schedule issue” action beside “My day”, opening a small modal/select of eligible issues (respect the write permission and the unestimated rule). Keep removal in the row menu. Do not add a new visual system.

### Acceptance criteria

- [ ] Writers see a “Schedule issue” primary action on `/plan`.
- [ ] It lists sized issues not yet planned this week and commits the selection.
- [ ] Success updates lanes/capacity immediately; failure shows an actionable error.
- [ ] Readers do not see the action.

---

## Finding: Planned issues without a size vanish from the plan while the page claims the week is empty

- Route: `/plan?week=2026-11-02` vs `/board` and `/issues/demo/funnel/4`
- Component: `src/lib/components/plan/PlanLanes.svelte`, planning loaders
- Viewport: 1440x900
- Theme: light
- Category: feedback/state
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/planning/plan-desktop-light-planned-unsized-empty.png`, `audit/ui-ux/screenshots/planning/board-desktop-light-planned-unsized.png`
- Existing issue match: none

### Problem

An issue can carry `Planned: This week · 2 Nov` while having no size. That is the seeded state of FUN-4: the issue Properties panel says “This week · 2 Nov”, the board card shows “2 Nov 2026”, but `/plan` for that week says “Nothing is planned for this week.”, shows 0m in every lane, and lists FUN-4 only under “Unestimated” with no indication that it is committed. Clearing an issue's size after scheduling (allowed from Properties) creates this state.

### Steps to reproduce

1. Open `/issues/demo/funnel/4` and confirm Planned = “This week · 2 Nov”, Size = “Not estimated”.
2. Open `/board` and find FUN-4 with the “2 Nov 2026” planned marker.
3. Open `/plan` for Week of 2 Nov 2026.

### Actual behavior

The plan claims nothing is planned and counts no committed minutes; the issue is only in the unestimated list.

### Expected behavior

Either prevent clearing the size while an issue is planned, or show the committed-but-unestimated issue as a placeholder in its maintainer lane with an “estimate to count” warning. The page must never say “Nothing is planned” when a planned issue exists.

### Impact

Capacity is wrong and the user can double-book the same person. The board and plan disagree about the same issue, undermining trust in the whole planning model.

### Suggested direction

Include planned issues with a null size in `plannedCount` and in a lane-level “needs estimate” row; surface a warning on the lane/header (conventional inline alert or text). Alternatively reject removing size for planned issues at the write path.

### Acceptance criteria

- [ ] A planned issue with no size is visible as planned in its maintainer lane (or blocked from reaching that state).
- [ ] The empty-week state is not shown when any issue is committed to the week.
- [ ] Capacity text distinguishes counted minutes from unsized commitments.
- [ ] Board and plan agree on whether the issue is planned.

---

## Finding: Day page overflows horizontally at 390px and hides block controls

- Route: `/day`
- Component: `src/lib/components/plan/DayPlan.svelte` (`.day-layout`, `.day-timeline`)
- Viewport: 390x844
- Theme: light
- Category: responsive
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/planning/day-mobile-light-overbooked.png`, `audit/ui-ux/screenshots/planning/day-desktop-light-autoplanned.png`
- Existing issue match: none

### Problem

With blocks on the day, `.day-layout` has a single implicit grid track that sizes to content (647.6px) inside a 358px content area. The document becomes 664px wide at a 390px viewport: the timeline is 647.6px and each block 573.6px. The page itself scrolls horizontally, and the block's right-side `4h` and `Remove` controls sit off-screen. The 09:00–13:00 block extends past the visible timeline and cannot be fully seen without sideways page scrolling. At 768px and 1440px the same layout is fine.

### Steps to reproduce

1. Open `/day` with at least one block (Auto-plan).
2. Set the viewport to 390x844.
3. Check `document.documentElement.scrollWidth` and try to reach the block's Remove control.

### Actual behavior

`scrollWidth` 664 > 390; timeline 647.6px; block 573.6px; right-side controls off-screen.

### Expected behavior

No page-level horizontal scrolling at 390px. The timeline either fits the column or scrolls inside its own bounded container, and block controls remain reachable without moving the whole page.

### Impact

The required mobile viewport is broken: content and controls are wider than the screen, and horizontal page scrolling fights the vertical timeline reading. Composition A explicitly requires no horizontal page overflow at 390px.

### Suggested direction

Set `.day-layout { grid-template-columns: minmax(0, 1fr); }` at the base breakpoint and `min-width: 0` on the grid children. If the hour row still needs a minimum width, wrap `.day-timeline` in an overflow-x container (like `.table-responsive`) so only the chart scrolls. Keep the candidate aside full width.

### Acceptance criteria

- [ ] At 390x844, `scrollWidth === innerWidth`; no horizontal page scroll.
- [ ] Timeline blocks and their Remove/start-time controls are visible or scroll only inside the timeline container.
- [ ] The 768 and 1440 layouts remain unchanged.
- [ ] Verified in light and dark themes.

---

## Finding: Timeline milestone labels are clipped and overlap at desktop and tablet widths

- Route: `/timeline`
- Component: `src/lib/components/timeline/TimelineChart.svelte`
- Viewport: 1440x900, 768x1024
- Theme: light and dark
- Category: typography/spacing
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/planning/timeline-desktop-light-labels-clipped.png`, `audit/ui-ux/screenshots/planning/timeline-desktop-light-default.png`, `audit/ui-ux/screenshots/planning/timeline-desktop-dark-labels.png`
- Existing issue match: none

### Problem

The label rows are fixed at `--funnel-timeline-row: 2.75rem` (44px) at ≥768px, but the row content is title + a second line that wraps to `ref`, `due`, and `progress`. When the second line wraps (e.g. the first milestone `FUN#1 · Due 25 Nov 2026 · 2/10 closed`), the row needs 57–71px. `overflow: hidden` clips the title, and `justify-content: center` pushes it above the row into the sticky header. Measured on the first row: title span at `y = row.y - 14`, second block 46px tall inside a 44px row; every row reports `scrollHeight > clientHeight`. The visible result is a half-cut “v2.0 — cockpit” title and labels that appear interleaved with the following row. At 390px the stylesheet raises the row to 4.5rem and the labels render correctly, so the defect is specific to desktop/tablet.

### Steps to reproduce

1. Open `/timeline` at 1440x900 (all repositories).
2. Inspect the first milestone row in the Milestone labels column.
3. Resize to 768x1024 and repeat.

### Actual behavior

First milestone title is clipped by the sticky header; label content overlaps adjacent rows; rows report clipped scroll height.

### Expected behavior

Each label row is tall enough for its content, or its content is truncated to a single line; label rows align one-to-one with chart bands with no clipping.

### Impact

The primary textual key for the chart is unreadable for the first milestone and visually collides with neighbouring rows, so the timeline cannot be reliably matched to its bars.

### Suggested direction

Let the label rows drive `rowHeight` (measure content with `min-height` rather than a fixed 44px), or constrain the metadata line to one line with `text-truncate` and available width. Keep the chart band height in sync through the existing `measure()` path. Consider widening the label column at md+ or hiding the repo ref below lg (it is already hidden below md).

### Acceptance criteria

- [ ] No label row reports `scrollHeight > clientHeight` at 1440, 768, or 390.
- [ ] First milestone title is fully visible and never sits under the header.
- [ ] Chart bands remain aligned with label rows.
- [ ] Verified in light and dark themes.

---

## Finding: Matrix selection has no visible feedback on mobile; detail panel is below the fold

- Route: `/matrix`
- Component: `src/routes/(app)/matrix/+page.svelte` (`col-lg-5` grid / `col-lg-7` detail), `MatrixGrid`, `MatrixCellDetail`
- Viewport: 390x844
- Theme: light
- Category: responsive
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/planning/matrix-mobile-light-cell-selected.png`, `audit/ui-ux/screenshots/planning/matrix-mobile-light-default.png`
- Existing issue match: none

### Problem

Below `lg`, the matrix and its issue detail stack; the matrix comes first. Tapping a cell changes the URL and the cell's thin selection bar, but the section that names the selected quadrant and lists its issues starts below the fold (heading top ≈904 on an 844px viewport, `scrollY = 0`). The user taps “Moderate / Mid” and sees no content change; discovering the result requires scrolling down past the matrix. The table itself is 480px wide inside a 364px area at 390px, so the Low column is off-screen with no scroll cue. Selecting a cell in that hidden column requires horizontal scrolling first.

### Steps to reproduce

1. Open `/matrix` at 390x844.
2. Tap the Moderate/Mid cell (count 4).
3. Observe the viewport; check the detail heading position.

### Actual behavior

Only the cell border changes; the inspector heading is at y≈904 and off-screen. The Low column is outside the visible table area.

### Expected behavior

Selecting a cell produces an immediately visible result: the detail (or a summary) is adjacent to or above the matrix on mobile, or the page scrolls/focuses the detail heading. The matrix either fits the viewport or clearly indicates horizontal scroll.

### Impact

On the required mobile viewport, cell selection appears to do nothing. Users cannot follow the matrix's core select → inspect workflow without guessing to scroll, and some quadrants are not discoverable at all.

### Suggested direction

At `<lg`, place the selected-cell summary directly under the grid or render the detail as an expandable section beneath the selected row, and move focus to the detail heading after selection. For the grid, reduce columns/padding so all three urgency columns fit at 390px, or add an explicit horizontal-scroll affordance (visible scrollbar/hint) and avoid changing selection invisibly. Do not add a new interaction model; a Bootstrap `.table-responsive` with a visible cue is enough.

### Acceptance criteria

- [ ] After tapping any cell at 390px, the selected quadrant summary is visible without scrolling, or the page scrolls/focuses it automatically.
- [ ] All three urgency columns are reachable and it is obvious that the matrix scrolls horizontally if it must.
- [ ] Keyboard selection still works.
- [ ] Verified in light and dark themes.

---

## Finding: Day candidates remain addable after planning and the overlap error offers a Retry that cannot succeed

- Route: `/day`
- Component: `src/lib/components/plan/DayPlan.svelte`
- Viewport: 1440x900
- Theme: light
- Category: feedback/state
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/planning/day-desktop-light-duplicate-block.png`, `audit/ui-ux/screenshots/planning/day-desktop-light-autoplanned.png`
- Existing issue match: none

### Problem

After Auto-plan places FUN-4 at 09:00–13:00, the Candidates panel still lists FUN-4 with an enabled “Add” button and the stats still say “1 candidate”. Clicking Add attempts a second block at 09:00 and fails with “Blocks overlap at 09:00” plus a “Retry” link. Retrying the same deterministic overlap can never succeed. The candidate has no “planned” state, so the user cannot tell whether adding again is meant to split the issue across blocks or is invalid.

### Steps to reproduce

1. Open `/day` with one sized candidate.
2. Click Auto-plan.
3. Click the candidate's Add button again.
4. Observe the error and the Retry action.

### Actual behavior

An overlap error is shown with a Retry link that repeats the same failing request; the candidate still looks unplanned.

### Expected behavior

A planned candidate is marked as scheduled (or Add is disabled/replaced with “Add another block” if splitting is supported). Validation errors explain how to resolve the overlap and do not offer a retry that cannot succeed.

### Impact

Users can trap themselves in a failing action loop and may believe the day planner is broken. The candidate state contradicts the timeline.

### Suggested direction

Track which candidates already have blocks and render a “Planned” label/disabled Add, or make Add place the block at the next free slot. For overlap validation, show a non-retryable error with a “Remove overlapping block” or “Clear day” action; reserve Retry for transport/server failures.

### Acceptance criteria

- [ ] A planned candidate is visibly marked and cannot create a duplicate overlapping block by default.
- [ ] Add places at a free time if splitting is allowed.
- [ ] Overlap errors do not offer Retry; they offer a resolvable action.
- [ ] Candidate count/state matches the timeline after auto-plan and manual add.

---

## Finding: Board and matrix filters are hidden in a largely empty offcanvas instead of the approved toolbar row

- Route: `/board`, `/matrix`
- Component: `src/lib/components/filter/FilterPopover.svelte` (Sveltestrap `Offcanvas`)
- Viewport: 1440x900
- Theme: dark
- Category: bootstrap convention
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/planning/board-desktop-dark-filters.png`
- Existing issue match: none

### Problem

The “Filters” control opens a 400px full-height offcanvas containing eight collapsed dropdown buttons in a single row at the top and roughly 700px of empty space below. No filter labels, active-filter summary, Apply, or Clear action is visible. The only indication that filters are active is a count badge on the toolbar button. Composition A specifies a single visible filter row (status/priority/assignee, search) rather than a hidden panel, and warns against adding a second toolbar.

### Steps to reproduce

1. Open `/board` at 1440x900.
2. Click “Filters”.
3. Observe the panel and try to see which dimensions are active.

### Actual behavior

A mostly empty drawer covers the right of the board; the filter dimensions are unlabeled dropdown buttons; active values are hidden.

### Expected behavior

Filters are visible in the toolbar row (conventional selects) with a clear-filters action, or, if the offcanvas is retained for narrow widths, it groups dimensions under headings, shows active filters as removable chips, and provides Clear/Apply.

### Impact

Filtering takes more clicks and hides state; the drawer obscures the board it is meant to filter. It is a modern slide-over pattern in an otherwise conventional Bootstrap page.

### Suggested direction

At `lg+`, promote the primary dimensions (Status, Priority, Assignee) into the existing toolbar row as `form-select-sm` controls, matching Composition A §7.2, and leave the offcanvas only for long-tail dimensions at narrow widths. Add a visible “Clear filters” control when the count is non-zero. This is an adaptation of existing controls, not a new design system.

### Acceptance criteria

- [ ] At 1440px, status/priority/assignee filters are visible in the toolbar without opening a panel.
- [ ] Active filters are readable and individually removable/clearable.
- [ ] The offcanvas, if kept, has grouped headings and a clear action and does not look empty.
- [ ] No second toolbar row is added.
