# Issues and Inbox — findings

Workstream B. Revision `3d229791dadf073eab2c22302d1d59b3c421c81c`, instance `http://127.0.0.1:3002` (session `ux-issues`, demo data).

---

## Finding: Issue index title column collapses at the 768px tablet breakpoint

- Route: `/issues`
- Component: `src/lib/components/issue/IssueTable.svelte` (column widths), `src/routes/(app)/issues/+page.svelte`
- Viewport: Tablet — 768×1024
- Theme: Light and dark
- Category: responsive
- Suggested priority: P1
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issues-index-tablet-light-default.png` (also `issues-index-tablet-dark-default.png`)
- Existing issue match: none

### Problem
At 768px the table shows all five metadata columns at once with fixed widths (`7rem/8rem/7rem/8rem/10rem`), plus the `Planned` column added by production. The five fixed columns consume about 640px of a 672px content area, leaving the Title column 102px wide. Titles wrap to one or two words per line and every row becomes 143–239px tall. Reading the index, the page's primary task, is effectively impossible at a required viewport.

### Steps to reproduce
1. Set the viewport to 768×1024 and open `/issues`.
2. Observe the group "Backlog" and its first rows.

### Actual behavior
- Measured column widths (768px): Issue 112px, Title 102px, Status 128px, Priority 112px, Planned 128px, Assignee 160px.
- Row heights: 143, 167, 191, 191, 239px. "Board cards flicker when the SSE refresh lands mid-drag" renders over 10 lines.
- No horizontal overflow, so the table "fits" by destroying the title column.

### Expected behavior
At `md` the title should remain the dominant, scannable column (Composition A §12: ID/title/status/priority/assignee). Secondary columns should be dropped or the table should scroll horizontally rather than squeeze Title below a readable width. The `Planned` column is not in Composition A's six and is the direct cause of the extra 128px.

### Impact
Every issue title on the main list is hard to read at tablet width. Users must scroll several screens for a handful of issues or zoom out. Tablet is one of the three required audit viewports.

### Suggested direction
Hide or collapse `Planned` below `lg`, and give the remaining columns `text-nowrap`/smaller width hints so Title takes the remainder. Verify at 768, 820 and 991 widths. If all seven columns must stay, use the bordered `.table-responsive` scroll rather than wrapping the title.

### Acceptance criteria
- [ ] At 768×1024, the Title column is at least 300px wide with the default group.
- [ ] Rows without labels stay close to the Composition A 41px rhythm; no title exceeds two lines in a normal row.
- [ ] No horizontal page overflow at 390px, and no regression at 1440px.
- [ ] `Planned` is either hidden below `lg` or the table scrolls without compressing Title.

---

## Finding: Accepting or declining an intake submission ends on a 404 "Submission not found"

- Route: `/inbox`
- Component: `src/lib/components/inbox/InboxTable.svelte` (forms post to the submission detail route)
- Viewport: Desktop 1440×900 (all widths)
- Theme: Light (dark unaffected)
- Category: workflow | feedback/state | navigation/IA
- Suggested priority: P1
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/inbox-table-desktop-light-accept-404.png`
- Existing issue match: none

### Problem
Both triage actions on the Inbox table are enhanced forms whose `action` points at `/inbox/submission/<id>?/accept` (or `?/dismiss`). Because the form lives on a different route than the action, SvelteKit navigates to the submission route after the action succeeds — but the submission has just been consumed, so its loader returns 404. The queue item is accepted/dismissed, yet the user is dropped on the global error page with no confirmation and no way back to the Inbox.

### Steps to reproduce
1. Open `/inbox` with at least one staged submission.
2. Click **Accept** on a submission row.
3. Wait for the response.
4. Repeat with **Decline** → **Dismiss submission** in the confirmation dialog.

### Actual behavior
- The row is removed server-side (the queue count decreases after a reload).
- The browser navigates to `/inbox/submission/<id>` and renders `404 · Page not found · Submission not found`, with "Try Again" and a "Back to Issues" link (not Inbox).
- No success message, no undo, no return to the queue.
- Reproduced four times: Accept on `demo-intake-4`, `demo-intake-3` and a UUID-identified submission, and Decline → Dismiss on `demo-intake-2`.

### Expected behavior
After a successful decision the user stays on `/inbox`, sees the row removed, the counts updated, and a brief success status. Declining should likewise return to the queue. A failure should keep the row and show an inline error.

### Impact
The primary Inbox workflow completes in the database but ends in an error page every time. Users cannot tell whether the action succeeded, cannot triage the next item without navigating back, and lose their search/filter context.

### Suggested direction
Move the accept/dismiss/duplicate actions to the Inbox route (or an `/api` endpoint) and update the local feed optimistically, as the detail page's `settle()` already does. A smaller fix is to pass `navigate: false` to `update()` in the enhance callbacks, but the actions should still live on the route that owns the form. Do not navigate after a successful decision; remove the row, decrement the counts, and show an inline success/undo line. Return the user to `/inbox` if a redirect is unavoidable.

### Acceptance criteria
- [ ] Accept from `/inbox` leaves the user on `/inbox`, row removed, counts updated, success feedback visible.
- [ ] Decline → Dismiss behaves identically and still records the dismissal.
- [ ] No request to `/inbox/submission/<id>` after the decision.
- [ ] A server failure keeps the row and shows the error inline.
- [ ] Works with JavaScript disabled (plain form post returns to the Inbox, not a 404).

---

## Finding: Two filter surfaces with split responsibilities; "Filters" opens a drawer that excludes the main filters

- Route: `/issues`
- Component: `src/routes/(app)/issues/+page.svelte`, `src/lib/components/filter/FilterPopover.svelte`
- Viewport: Desktop 1440×900 (also tablet/mobile)
- Theme: Light
- Category: navigation/IA | complexity | visual consistency
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issues-index-desktop-light-filters-open.png`
- Existing issue match: none

### Problem
The toolbar holds Search, Status, Priority, Assignee and Group, while a separate quiet **Filters** link sits in the page-header actions and opens a 400px right offcanvas containing State, Repo, Size, Labels, Planned and Milestone. Filtering is therefore split across two surfaces with no cue about which dimension lives where; the "Filters" affordance is the more prominent, discoverable label but does not contain the filters users most often want. The drawer also repeats the word "Filters" as both its header and its first body line, and covers the table it filters.

### Steps to reproduce
1. Open `/issues` at 1440×900.
2. Note the single toolbar row and the separate "Filters" link above it.
3. Click **Filters** and compare the controls in the drawer with the toolbar.

### Actual behavior
- Status/Priority/Assignee exist only in the toolbar (hidden from the drawer via `hide`).
- State (Open/Closed/All) exists only in the drawer, so a user who wants closed issues has to know to look behind "Filters".
- The drawer's body repeats the heading "Filters".
- The drawer's badge counts the search term (see the "Filters drawer Clear" finding) but not the toolbar's status/priority/assignee filters, so the number does not represent the whole view.
- Composition A defines one toolbar row and no second filtering surface (§7.2).

### Expected behavior
One predictable place to filter. Either the toolbar contains all dimensions (including State), or a single "Filters" control contains all of them and the toolbar does not duplicate a subset. The active-filter count and the Clear action cover the same set as the badge.

### Impact
Users must hunt in two places, and the most consequential scope switch (Open vs Closed) is hidden behind a control whose label implies it holds everything. This is recurring friction on the primary list.

### Suggested direction
Fold State into the toolbar (or the drawer) so the two surfaces do not overlap conceptually. If the offcanvas stays for long-tail filters, label the entry point "More filters" and show the toolbar-owned active count separately. Remove the duplicated "Filters" heading inside the body.

### Acceptance criteria
- [ ] Every filter dimension is reachable from one clearly labelled surface.
- [ ] The active-filter badge and Clear action cover exactly the active filters.
- [ ] No duplicate "Filters" heading inside the drawer.
- [ ] The layout remains one toolbar row at `lg`+ per Composition A.

---

## Finding: Status column displays "Blocked" instead of the issue's status, contradicting filtering and grouping

- Route: `/issues` (also detail header vs index)
- Component: `src/lib/components/common/StatusText.svelte`, `src/lib/components/issue/IssueTable.svelte`
- Viewport: Desktop 1440×900
- Theme: Light
- Category: component behavior | visual consistency | bootstrap convention
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issues-index-desktop-light-blocked-under-inprogress.png` (also `issues-index-tablet-light-default.png` for FUN-8/FUN-7 inside Backlog/Todo, and `issue-detail-desktop-light-blocked.png`)
- Existing issue match: #23

### Problem
`StatusText` renders the word "Blocked" whenever `blocked` is true, replacing the real status. On the index this makes rows disagree with their own status group: FUN-6 is an In-progress issue shown as "Blocked" under the "In Progress" group, and FUN-8/FUN-7 are Backlog/Todo issues shown as "Blocked" under those groups. Filtering `?status=in-progress` returns FUN-6, which reads "Blocked". The detail page of the same issue shows "Backlog" in the meta row plus a separate blocked panel, so the same fact is presented two different ways. #23 covers adding a blocked filter dimension; the label swap itself is a separate defect.

### Steps to reproduce
1. Open `/issues?status=in-progress`.
2. Compare the group header ("In Progress") with FUN-6's Status cell ("Blocked").
3. Open `/issues/demo/funnel/8` and compare its meta row ("Backlog") with the index row ("Blocked").

### Actual behavior
- Status cell: "Blocked" (red slash icon), no indication of Backlog/Todo/In progress.
- Group header, status filter and detail header still use the underlying status.
- The Status filter offers All statuses/Backlog/Todo/In progress/In review only — no Blocked.

### Expected behavior
Status and blocked are separate dimensions. Show the status consistently everywhere and add a distinct blocked indicator (icon/badge/second line) so the row reads e.g. "In progress · Blocked". If the product insists on the "Blocked" label, it must at least match the filter/group semantics and be filterable.

### Impact
The main list's status column cannot be trusted for filtering or grouping; users who filter "In progress" see a row labelled "Blocked", and blocked work is invisible to the status filter.

### Suggested direction
Keep `StatusText` as status-only and render blocked as a separate danger icon/badge with an accessible name. Keep the detail page's blocked panel as the canonical explanation.

### Acceptance criteria
- [ ] Status cells always match the issue's status and the active status filter.
- [ ] Blocked issues show a separate visible and accessible blocked indicator.
- [ ] No row's status contradicts its group header.

---

## Finding: Every issue row is a second, semantically empty tab stop

- Route: `/issues`
- Component: `src/lib/components/issue/IssueTable.svelte`
- Viewport: Desktop 1440×900
- Theme: Light
- Category: accessibility
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issues-index-desktop-light-row-focus.png`
- Existing issue match: none

### Problem
Each `<tr>` has `tabindex="0"` and an Enter handler, and also contains a real title link. Keyboard users therefore tab twice per issue; the first stop is a focusable table row with no `role`, no accessible name and no indication that Enter navigates. With 22 issues the list had 78 focusable elements, 44 of them from rows (row + link per issue).

### Steps to reproduce
1. Open `/issues` with a keyboard.
2. Tab into the table.
3. Observe two focus stops per row; the first shows the blue row outline and does nothing on Space, navigates on Enter only.

### Actual behavior
- A `<tr>` is focusable without a role or name; screen readers announce it as a row, not as a control.
- The title link immediately after it is the correct, conventional target.
- Tab count scales at 2× the issue count.

### Expected behavior
One tab stop per issue, through the title link (Composition A §13: "Replace the `role="button"` on `<tr>` as the sole affordance with a real title link plus row click"). The row may stay clickable for the mouse, but should not be a separate focus target unless it is given a role and accessible name and behaves like a link.

### Impact
Keyboard and switch users traverse the list at double length and meet an unlabelled focus target before the real link. This is the core browse workflow.

### Suggested direction
Remove `tabindex`/keydown from `<tr>` and keep the click handler plus `cursor: pointer`; the title link then provides keyboard and middle-click access. If row focus is kept for convenience, make the row a labelled link-like control (not both), and verify screen-reader output.

### Acceptance criteria
- [ ] One tab stop per issue row.
- [ ] Enter/Space on that stop opens the issue and is announced as a link.
- [ ] Focus ring remains visible on the title link (and on the row only if it remains interactive).
- [ ] Mouse click anywhere on the row still opens the issue without hijacking text selection.

---

## Finding: Mobile issue detail buries the Properties card after the whole thread and attachments

- Route: `/issues/<owner>/<repo>/<n>` (measured on `/issues/demo/funnel/1`)
- Component: `src/lib/components/issue/IssueDetailPage.svelte`
- Viewport: Mobile 390×844
- Theme: Light
- Category: responsive | workflow
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issue-detail-mobile-light-properties-position.png`
- Existing issue match: none (Composition A marks the mobile order as UNRESOLVED)

### Problem
The DOM order is document → Activity → Work notes → Attachments → Properties → Details. On a phone the Properties card begins 1660px down a 3061px page (about two viewports), after the entire description, three comments, the composer, work notes and attachments. Changing status, assignee or milestone therefore requires a long scroll with no shortcut from the header; the status shown in the header is not an affordance.

### Steps to reproduce
1. Open `/issues/demo/funnel/1` at 390×844.
2. Try to change the status or assignee without scrolling to the bottom.

### Actual behavior
- Properties heading at y≈1660; viewport height 844.
- No sticky summary, no jump link, no metadata control near the title.
- The same order applies at 768px, where the page is also stacked.

### Expected behavior
Metadata editing should be reachable without traversing the conversation. Composition A leaves the exact order open; either move Properties above Activity on narrow screens, or provide a compact metadata summary/jump action near the header.

### Impact
Mobile triage and status updates are slow and easy to abandon; users may not discover that these fields are editable at all.

### Suggested direction
On `<lg`, place Properties (and Details) before Activity, or add a small "Properties" anchor/button next to the meta row that jumps to the card. Keep the desktop 8/4 order unchanged.

### Acceptance criteria
- [ ] At 390px, the Properties card or a jump control to it is reachable within one viewport of the header.
- [ ] Status, assignee and milestone remain editable at 390px.
- [ ] Desktop 1440 and tablet 768 layouts keep the document-first reading order.
- [ ] The change is verified in both themes.

---

## Finding: Cancelling the close/reopen dialog leaves the Properties status select out of sync

- Route: `/issues/demo/funnel/1` (close) and `/issues/demo/funnel/5` (reopen)
- Component: `src/lib/components/issue/IssuePropertiesCard.svelte`
- Viewport: Desktop 1440×900
- Theme: Light
- Category: component behavior | feedback/state
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issue-detail-desktop-light-status-stale-after-cancel.png` (header "In progress", select "Done"); `issue-detail-desktop-light-closed-status-stale.png` (header "Closed", select "In Review")
- Existing issue match: none

### Problem
Choosing **Done** in the Status select opens the close dialog before any write. If the dialog is cancelled, the underlying issue is unchanged and the header still reads "In progress", but the select keeps the user's "Done" selection because the reactive `statusValue` did not change and Svelte does not reset the DOM value. The same happens in reverse when a closed issue's status change opens the reopen dialog and is cancelled. The page then shows two contradictory statuses, and choosing the same option again fires no change event, so the dialog cannot be reopened without first selecting a different status (which writes it) or reloading.

### Steps to reproduce
1. Open an in-progress issue and set Status to **Done**.
2. Cancel the "Close issue" dialog.
3. Read the header ("In progress") and the Status select ("Done").
4. Try choosing Done again from the select.

### Actual behavior
- Header/meta: "In progress"; Properties select: "Done".
- Re-selecting Done does nothing (the value is already Done).
- Closed issue variant: header "Closed", select "In Review".
- A reload restores the correct value.

### Expected behavior
Cancelling a dialog restores the select to the issue's actual state. Either bind the select to the model so it re-renders, reset it in the cancel handler, or defer the optimistic value change until the dialog commits.

### Impact
The user cannot trust the Properties card, and the close/reopen flow becomes a two-step workaround or a page reload. Selecting a different status just to reopen the dialog performs an unintended write.

### Suggested direction
Keep the select's displayed value derived from `issue.state`/`issue.status`; when a dialog is cancelled, force the control back to that value. Consider disabling the select while the resolution dialog is open.

### Acceptance criteria
- [ ] Cancelling a close dialog leaves Status showing the issue's current status.
- [ ] Cancelling a reopen dialog leaves Status showing Closed.
- [ ] Re-selecting the intended status after a cancel opens the dialog again.
- [ ] Covered by a component test.

---

## Finding: Inbox shows a success "Inbox is clear" message when a search simply matches nothing

- Route: `/inbox?q=<no match>`
- Component: `src/routes/(app)/inbox/+page.svelte`, `InboxTable.svelte`
- Viewport: Desktop 1440×900 (rendering is identical at all widths)
- Theme: Light
- Category: feedback/state
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/inbox-table-desktop-light-empty-search.png`
- Existing issue match: none

### Problem
When the queue has items but the search term matches none, the page renders the same green success alert used for a genuinely empty queue: "Inbox is clear. Nothing is waiting for triage." The navbar badge simultaneously says "Inbox 6" and the summary reads "0 submissions · 0 untriaged issues". This tells the user there is nothing to triage when in fact the queue is only filtered.

### Steps to reproduce
1. Open `/inbox` with pending items.
2. Type a nonsense query such as `zzzz` in "Search inbox".
3. Observe the alert and the navbar badge.

### Actual behavior
- Green success alert "Inbox is clear. Nothing is waiting for triage."
- Summary "0 submissions · 0 untriaged issues"; navbar "Inbox 6".
- No "no results" explanation and no clear-search action in the empty region.

### Expected behavior
Distinguish an empty queue from an empty result set. The no-match state should say that no items match the search, keep the queue totals or label them as filtered, and offer "Clear search". The success alert should appear only when the underlying queue is empty.

### Impact
A user can conclude the queue is empty while six items are waiting, especially when the navbar count is out of sight on mobile. It also makes the summary numbers untrustworthy.

### Suggested direction
Branch on the unfiltered total (or on `filter.search`/active filters) before rendering the success alert; reuse the issue index's "No items match this view" pattern with a Clear search button.

### Acceptance criteria
- [ ] No-match search shows a neutral empty-results message, not the success alert.
- [ ] The success alert appears only when the queue has no submissions and no untriaged issues.
- [ ] A clear-search action is available in the no-match state.
- [ ] Counts are labelled consistently with the active filter.

---

## Finding: Inbox queue and counts stay stale after "Triage as issue"

- Route: `/inbox/submission/<id>` → Triage as issue, back on `/inbox`
- Component: `src/lib/components/inbox/SubmissionDetail.svelte` (`settle` uses `invalidateAll: false`), `InboxTable.svelte`
- Viewport: Desktop 1440×900
- Theme: Light
- Category: feedback/state | component behavior
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/inbox-submission-detail-desktop-light-after-triage.png`
- Existing issue match: #19

### Problem
Accepting a submission from its detail page navigates back to `/inbox`, but the queue data is not refreshed. The consumed submission remains in the queue with its Accept/Decline buttons and the summary counts are wrong until a manual reload. The same page also showed "0 untriaged issues" while one untriaged row was still listed after a status triage. Related to #19's triage-history work but a separate state-refresh defect.

### Steps to reproduce
1. Open a submission detail page and click **Triage as issue**.
2. Land on `/inbox` and compare the table with the summary.
3. Reload.

### Actual behavior
- Immediately after the action: three rows (two untriaged issues plus the just-triaged submission) and "1 submission · 1 untriaged issue".
- A phantom row offers Accept/Decline for a submission that no longer exists; clicking it would 404.
- After a reload: two rows and "0 submissions · 2 untriaged issues".
- Separately, after triaging PLT-5 to Backlog the summary read "0 submissions · 0 untriaged issues" while one untriaged row remained.

### Expected behavior
After any triage decision, the queue, its row count and its summary reflect the server state without a reload. Removed items must not remain clickable.

### Impact
Users see and can act on already-consumed items and cannot trust the queue summary. This is the queue's core state.

### Suggested direction
Invalidate the inbox feed (or update it optimistically like the table's `removeSubmission`/triage path) when returning from a detail decision. Derive the summary from the same projected entries shown in the table rather than from a separately adjusted total.

### Acceptance criteria
- [ ] After Triage as issue, the submission is gone from `/inbox` without a reload.
- [ ] Summary counts always equal the visible rows/underlying queue.
- [ ] No action can be taken on a consumed submission.
- [ ] After an issue status triage, the remaining untriaged count is correct.

---

## Finding: Filters drawer "Clear" counts the search term but does not clear it

- Route: `/issues?q=<term>`
- Component: `src/lib/components/filter/FilterPopover.svelte` (`clearAll` preserves `search`), `activeFilterCount` in `src/lib/url-filter.ts`
- Viewport: Desktop 1440×900
- Theme: Light
- Category: feedback/state
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issues-index-desktop-light-search-filters-open.png`
- Existing issue match: none

### Problem
The Filters button badge and the offcanvas header use `activeFilterCount`, which includes a non-empty `q`. But the offcanvas's Clear calls `clearAll`, which deliberately preserves `search`. With only a search active, the drawer shows "Filters 1" and a Clear button; pressing Clear changes nothing and the badge stays 1. The page-header link "Clear 1 active filter" does clear it, so two Clear actions with the same count behave differently.

### Steps to reproduce
1. Open `/issues?q=cockpit`.
2. Click **Filters 1**, then **Clear** inside the drawer.

### Actual behavior
- URL remains `/issues?q=cockpit`; results stay at 2; badge stays 1; the drawer stays open.
- The header "Clear 1 active filter" resets the search.

### Expected behavior
The count, the drawer's Clear and the header's Clear should operate on the same set. Either exclude search from the drawer's count and label the count "other filters", or let Clear also clear the search.

### Impact
A visible Clear control appears to be broken and the two counts disagree. Minor but erodes trust in the filter model.

### Suggested direction
Compute the badge from the dimensions the drawer can clear, and keep the header's all-inclusive Clear separate. Alternatively make the drawer's Clear reset every active dimension, including `q`.

### Acceptance criteria
- [ ] With only a search active, the drawer either shows no count/Clear or its Clear clears the search.
- [ ] Badge count always equals the number of filters the associated Clear removes.
- [ ] The header and drawer Clear actions are documented/consistent.

---

## Finding: Inline title editing has no visible save/cancel and commits on blur

- Route: `/issues/<owner>/<repo>/<n>`
- Component: `src/lib/components/issue/IssueDetailPage.svelte` (title editor)
- Viewport: Desktop 1440×900
- Theme: Light
- Category: component behavior | feedback/state | bootstrap convention
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issue-detail-desktop-light-title-editing2.png`
- Existing issue match: none

### Problem
Clicking the issue heading swaps the `h1` for a borderless input with no Save/Cancel buttons, no visible editing affordance and no hint. Pressing Escape cancels, but blurring or pressing Tab commits the change silently (no success message, no undo). The description editor 40px below has explicit Cancel/Save buttons, so the two editors use different conventions.

### Steps to reproduce
1. Open an issue and click the title.
2. Type a change, then click elsewhere or press Tab.
3. Reopen the issue — the change is saved with no confirmation.

### Actual behavior
- The input is indistinguishable from static text except for a caret.
- Blur commits; no visible save state or confirmation.
- Escape cancels (undiscoverable).
- Body editor: six-row textarea + Cancel/Save.

### Expected behavior
The title editor should either follow the description editor's Save/Cancel pattern or clearly indicate "Enter to save · Esc to cancel" and show a success state after commit.

### Impact
Accidental edits persist without the user knowing; users may also abandon a desired edit because there is no obvious way to save.

### Suggested direction
Use a small inline form with Save/Cancel beside the input, or commit on Enter and revert on blur unless explicitly saved. At minimum add a one-line hint and a saved state.

### Acceptance criteria
- [ ] Entering edit mode is visually obvious.
- [ ] Save and cancel are both discoverable (buttons or a visible hint).
- [ ] A committed title shows feedback consistent with other writes.
- [ ] Escape and blur behavior are consistent and documented in the UI.

---

## Finding: "Ctrl Enter" keyboard hint is unreadable in the light theme

- Route: `/issues/<owner>/<repo>/<n>` comment composer
- Component: comment composer (`src/lib/components/issue/...` composer), `<kbd class="text-body-secondary">`
- Viewport: Desktop 1440×900
- Theme: Light
- Category: accessibility | visual consistency
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issue-detail-desktop-light-composer-focus.png`
- Existing issue match: none

### Problem
The composer's shortcut hint renders as a solid dark block with invisible text. The `<kbd>` keeps Bootstrap's dark `background` but `text-body-secondary` overrides its light text colour; the semi-transparent dark grey composites to the same dark colour, leaving effectively 1:1 contrast. The block reads as an empty or disabled button between the mode toggle and the primary Comment button.

### Steps to reproduce
1. Open an issue and focus the comment box.
2. Look at the action row: Attach · Markdown supported · [Comment | Internal note] · [black box] · Comment.

### Actual behavior
- Measured: `background: rgb(33,37,41)`, `color: rgba(33,37,41,.75)`, 14px — the label "Ctrl Enter" is invisible.
- The box visually competes with the real buttons.

### Expected behavior
The shortcut hint is legible in both themes, with contrast meeting WCAG AA, and does not look like a button.

### Impact
The keyboard shortcut is effectively undiscoverable, and the unexplained black block reads as a broken or disabled control in the primary composer.

### Suggested direction
Use Bootstrap's default `<kbd>` colours (light text on dark) or a bordered light badge in light mode; verify dark mode too. Keep it out of the button cluster.

### Acceptance criteria
- [ ] "Ctrl Enter" is legible at light and dark themes (≥4.5:1).
- [ ] The hint is not confused with a disabled/primary button.
- [ ] It is hidden from screen readers if purely decorative, or announced once with the composer.

---

## Finding: Label badges wrap onto a second line and inflate index rows to 71–95px

- Route: `/issues`
- Component: `src/lib/components/issue/IssueTable.svelte` (title cell flex-wrap)
- Viewport: Desktop 1440×900
- Theme: Light and dark
- Category: typography/spacing | visual consistency
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issues-index-desktop-light-default.png`
- Existing issue match: none

### Problem
Composition A places labels inline after the title and measures 41px rows. Production renders the title and labels in a wrapping flex container: any row with a label and a moderately long title pushes the badge to its own line, making the row 71px or 95px. The measured set on the default view was {41, 71, 95}px. This reduces the number of visible rows and creates an uneven rhythm between labelled and unlabelled issues.

### Steps to reproduce
1. Open `/issues` at 1440×900.
2. Compare a row with a label (FUN-1, 71px) with one without (FUN-14, 41px).

### Actual behavior
- Title column 526px; labels are separate flex children, so they wrap under the title.
- Rows with labels are 30–54px taller; roughly two fewer issues fit in the first viewport.

### Expected behavior
Labels sit inline after the title where they fit, or are constrained so they do not create a second line for ordinary titles; rows stay near the 41px rhythm per Composition A §7.4.

### Impact
The list loses its uniform scan rhythm and shows fewer issues per screen than the approved composition, especially when most issues carry a label.

### Suggested direction
Render the badges in the same inline flow as the title (or cap them to one line with a `+N` overflow) and let only genuinely long titles wrap.

### Acceptance criteria
- [ ] A normal title plus one short label remains a single-line 41px row at 1440.
- [ ] Long titles still wrap without clipping.
- [ ] Labels remain visible and readable in both themes.
- [ ] Mobile metadata line is unaffected.

---

## Finding: Search inputs expose two different clear controls

- Route: `/issues`, `/inbox`
- Component: `src/lib/components/filter/FeedSearch.svelte`
- Viewport: Desktop 1440×900 (visible at all widths)
- Theme: Light and dark
- Category: component behavior | visual consistency | bootstrap convention
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/inbox-table-desktop-light-empty-search.png`
- Existing issue match: none

### Problem
The input is `type="search"`, so Chrome renders its native clear "X" inside the field, and `FeedSearch` adds a second outlined button with an X at the right edge. Two adjacent X controls both clear the query; the outer one also sits on the input-group boundary and looks detached.

### Steps to reproduce
1. Open `/inbox`.
2. Type a query and look at the right side of the field.

### Actual behavior
- Native clear icon at the field's right padding plus a custom 32px outlined clear button.
- Both clear the query; the custom one is the only one with an accessible name.

### Expected behavior
One clear affordance. Either hide the native decoration (`::-webkit-search-cancel-button`) and keep the labelled button, or keep the native control and drop the custom one.

### Impact
Minor visual noise and a confusing duplicate control in the primary search field.

### Suggested direction
Suppress the native cancel button in CSS and keep the accessible custom button, or use a plain text input with the custom button only.

### Acceptance criteria
- [ ] A search query shows exactly one clear control.
- [ ] The control has an accessible name and keyboard access.
- [ ] Clearing works on `/issues` and `/inbox`, light and dark.

---

## Finding: Priority is announced as "High, High priority" and the P1–P3 token is hidden from assistive technology

- Route: `/issues` table, issue detail Properties
- Component: `src/lib/components/common/PriorityText.svelte`
- Viewport: Desktop 1440×900
- Theme: Light and dark
- Category: accessibility
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issues-index-desktop-light-default.png`
- Existing issue match: none

### Problem
`PriorityText` marks the visible "P1" with `aria-hidden="true"`, renders the level name, then adds a visually hidden ", High priority". Screen readers therefore hear "High, High priority" and never hear the P1/P2/P3 token that the rest of the product uses (filters, grouping, activity).

### Steps to reproduce
1. Open `/issues` with a screen reader or inspect the accessibility tree of a priority cell.
2. Focus/read a row such as PLT-2.

### Actual behavior
- Accessible name: "High, High priority".
- Visible text: "P1 High".

### Expected behavior
A single, non-duplicated announcement that includes the token, e.g. "P1, high priority", with no repeated word.

### Impact
Screen-reader users lose the priority token that the filters, grouping and activity use, and hear the level name twice, making the list harder to scan and compare.

### Suggested direction
Remove `aria-hidden` from the token and drop either the visible level name or the sr-only suffix; provide one `aria-label` such as `P1 high priority` on the wrapper.

### Acceptance criteria
- [ ] Priority is announced once, including the P1–P3 token.
- [ ] No duplication of the level name.
- [ ] Visual rendering is unchanged in both themes.

---

## Finding: Missing-issue state uses internal "not mirrored" wording and keeps a dead GitHub link

- Route: `/issues/<owner>/<repo>/<999>`
- Component: issue detail error branch
- Viewport: Desktop 1440×900
- Theme: Light
- Category: feedback/state | typography/spacing
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issue-detail-desktop-light-missing.png`
- Existing issue match: none

### Problem
An unknown issue renders "Issue demo/funnel#999 is not mirrored" — implementation language about the mirror — with a "Retry" link at the far right and "Return to Issues" underneath. The page still offers the "Open in GitHub" button at the top right, which points to a non-existent GitHub issue. There is no `h1`, so the error has no page heading.

### Steps to reproduce
1. Open `/issues/demo/funnel/999`.

### Actual behavior
- No heading; a red inline "not mirrored" message; Retry on the far right; Return to Issues on the next line.
- "Open in GitHub" → `https://github.com/demo/funnel/issues/999` (dead).
- Composition A expects "This issue does not exist. Return to Issues."

### Expected behavior
A plain 404-style message with a clear heading, one primary way back, and no actions for an issue that does not exist. Hide Open in GitHub when there is no issue.

### Impact
"Not mirrored" describes the internal sync model, not the user's problem, and the dead GitHub button invites a second error. The missing heading also breaks the page outline for screen-reader navigation.

### Suggested direction
Use user-facing copy ("This issue does not exist or is not available"), render it under an `h1`, group Retry/Return together, and conditionally hide the GitHub link.

### Acceptance criteria
- [ ] The page has an h1 and user-facing copy (no "mirrored").
- [ ] "Open in GitHub" is hidden for a missing issue.
- [ ] Retry only appears when a retry can succeed.
- [ ] Back navigation returns to the index.

---

## Finding: Issue detail mixes several date formats on one page

- Route: `/issues/demo/funnel/8`
- Component: issue detail meta, blocked panel, Delays table
- Viewport: Desktop 1440×900
- Theme: Light
- Category: typography/spacing | visual consistency
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/issues-inbox/issue-detail-desktop-light-blocked.png`
- Existing issue match: none

### Problem
One page presents time in three different conventions: relative ("opened 3w ago", "updated 2d ago"), ISO date ("Re-check 2026-11-09") and US locale date-time ("11/2/2026, 6:13:11 AM"). The index and the planned-week labels use a fourth style ("2 Nov 2026").

### Steps to reproduce
1. Open `/issues/demo/funnel/8`.
2. Compare the meta row, the blocked panel's "Re-check", and the Delays row.

### Actual behavior
- Meta: "3w ago", "2d ago".
- Blocked: "Re-check 2026-11-09".
- Delays: "11/2/2026, 6:13:11 AM" and "48h 10m".
- Index elsewhere: "2 Nov 2026".

### Expected behavior
One product-wide absolute format (the index already uses `2 Nov 2026`) with relative time only where it adds value, and the same timezone/precision on both sides of a delay.

### Impact
Comparing the re-check date with the delay history takes mental format conversion, and the page looks assembled from different subsystems.

### Suggested direction
Route all dates through the existing formatter used by `weekHeadline`/`absoluteTime`; use a `title` tooltip for the precise timestamp instead of printing locale strings in the table.

### Acceptance criteria
- [ ] Re-check uses the product's absolute date format.
- [ ] Delay start/end use the same format and timezone as each other.
- [ ] Relative times remain relative only in the meta and activity captions.
- [ ] Format is checked in light and dark and at mobile widths.

---

## Observations (not findings)

- **#16 (feed search too narrow) no longer reproduces.** At 1440 the `/issues` search is 396px wide and the full placeholder is legible; `/inbox` is 257px and also shows the full placeholder. The old 384px-pane layout does not exist in this revision. The field gets a full-width row below `lg`.
- **Grouping is not in the URL.** Group is persisted in localStorage (`list-prefs`), so a copied `/issues?status=todo` link does not reproduce the sender's grouping. Tracked as part of #23 ("Persist sort/group in the URL").
- **Group headers are collapsible**, although Composition A says they are not; the chevron is hover/focus-only. It is announced correctly with `aria-expanded`. Production extension; no user-facing defect found.
- **`Planned` is a seventh column** not in Composition A's six. It is mostly empty ("—") and is the direct cause of the tablet title collapse.
- **Property changes produce no activity event.** Composition A §8.3 expects "changed the status to In review · just now" in the timeline; production's Activity section contains comments and work notes only. The header's "updated just now" is the only confirmation.
- **Untriaged issue detail says "Unconfirmed" in the header but "No status" in the Properties select.** Same underlying state, two labels.
- **Untriaged alert offers Accept + Open Inbox, not Accept/Decline** as described in Composition A §8.1. Declining a GitHub-synced issue is not a concept in production (only submissions are declined).
- **Submission detail on mobile** puts the destructive red "Dismiss submission" first and the primary "Triage as issue" on the next line at the left. It works but inverts the hierarchy; desktop places Triage as issue at the far right correctly.
- **Submission rows have no value in the "Issue" column** ("—"), because the six-column table is shared with untriaged issues. The title link goes to the submission detail, so navigation works, but the column is empty for the submission half of the queue. A submission id/`Submission` label there (as on mobile) would make the column meaningful.
- **Inbox "Source" values mix casing**: "Intake", "GitHub" vs "email", "web", "chat". Normalize to one label style.
- **`/inbox/submission/1` is not a valid fixture id**; seeded ids are `demo-intake-*`. The global 404 offers "Back to Issues" rather than "Back to Inbox".
- **Clipboard feedback works** with a real click ("Copied" + check for 2s); a denied clipboard produces a persistent inline error at the top of the page.
