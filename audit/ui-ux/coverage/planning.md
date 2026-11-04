# Planning coverage

Revision: 3d229791dadf073eab2c22302d1d59b3c421c81c  
Server: http://127.0.0.1:3003  
Browser session: `ux-planning`

Legend: ✅ audited · ◐ partial · — not applicable / not reached

| Route / interaction | Desktop | Tablet | Mobile | Light | Dark | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/board` default (4 lanes, 20 cards) | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Lanes, counts, card anatomy, blocked cards, priority, planned marker. |
| `/board` card menu (three-dots) | ✅ | — | — | ✅ | — | audited | Menu is covered by following cards; all items hit-test to the cards below. Escape does not close it. |
| `/board` pointer drag between lanes | ✅ | — | — | ✅ | — | audited | Drag commits but leaves a stale copy in the source lane; count mismatch (see “Board moves leave…”). |
| `/board` keyboard move (`Space`, arrows, `Space`) | ✅ | — | — | ✅ | — | audited | Live-region announces internal `repo#number`, not the display ref. Duplicate-card bug reproduced (see “Board moves leave…”). |
| `/board` keyboard legend (keyboard icon) | ✅ | — | — | ✅ | — | audited | `↑↓←→`, `Space`, `S`, search documented; icon-only trigger. |
| `/board` Done drop → Close issue dialog | ✅ | — | — | ✅ | — | audited | Drag to Done opens the resolution dialog; note required; Cancel restores the card. Focus stays behind the dialog (see “Dialogs open without moving…”). |
| `/board` WIP limits and over-limit state | ✅ | — | — | ✅ | — | audited | Set Todo=1 / In Progress=4 in settings; headers show `2 / 1`, `6 / 4`, “Over WIP” with warning colour. |
| `/board` search with no result in 3 lanes | ✅ | — | — | ✅ | — | audited | Lane-local “No issues” + repeated “New Issue” links to `/intake` (not lane-preselected). |
| `/board` All / Mine scope | ✅ | — | — | ✅ | — | audited | `?assignee=me`; empty Todo/In Review show “No issues”. |
| `/board` Filters offcanvas | ✅ | — | — | — | ✅ | audited | 400px empty drawer, eight unlabeled dropdown buttons, no Clear/Apply (see “Board and matrix filters…”). |
| `/board` horizontal lane scroll | ✅ | ✅ | ✅ | ✅ | ✅ | audited | At 768 the In Review lane is cut at the right edge and Done is off-screen; no visible scroll cue. At 390 the next lane peeks (good). |
| `/board?view=backlog` | ✅ | — | — | ✅ | — | audited | 4-row list inside the fixed 60svh canvas, large empty bordered area; no column headers (see “Board canvas is pinned…”). |
| `/board` empty week / loading / error | — | — | — | — | — | not reached | No data set produced zero lanes; no forced loading or lane error. |
| `/matrix` default (summary, 3×3 grid, inspector) | ✅ | ✅ | ✅ | ✅ | ✅ | audited | 19 issues, 4 needs assessment, 15 rated; P labels, counts, legend hidden in Rating Guide. |
| `/matrix` cell selection | ✅ | — | ✅ | ✅ | ✅ | audited | Updates `?cell=` and inspector; keyboard arrows/Enter also work. Mobile detail is below the fold (see “Matrix selection has no visible feedback…”). |
| `/matrix` empty cell (0 issues) | ✅ | — | — | — | ✅ | audited | “No issues in this classification.”; selected aria-label correct. |
| `/matrix` assessment queue | ✅ | — | — | — | ✅ | audited | Rated one issue (Severe/High); total 4→3, matrix 5→6, focus advanced to the next row. Modal focus starts behind the trigger (see “Dialogs open without moving…”). |
| `/matrix` Rating Guide | — | — | ✅ | ✅ | — | audited | Long scrollable legend; focus stays on the trigger. |
| `/matrix` search → no matches | — | — | — | — | — | not reached | Not exercised; `InlineStatus` “No issues match these filters” exists in source. |
| `/matrix` narrow table scroll | — | — | ✅ | ✅ | — | audited | 480px table in a 364px area; Low column off-screen, no cue (see “Matrix selection has no visible feedback…”). |
| `/matrix/demo/funnel/1` legacy URL | ✅ | — | — | ✅ | — | audited | 307 to `/issues/demo/funnel/1`; issue Properties expose Impact/Urgency. |
| `/plan` empty week | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Empty state + Browse issues; lanes and capacity. |
| `/plan` week navigation | ✅ | — | — | ✅ | — | audited | Prev/next update `?week=`; “Today” link appears off the current week. |
| `/plan` capacity and scheduled rows | ✅ | ✅ | ✅ | ✅ | ✅ | audited | 4h issue split 2h/2h across demo+mira; bars, `Scheduled x of y`, remove. |
| `/plan` over-capacity | ✅ | — | — | ✅ | — | audited | 25h of 24h with red bar and “Over by 1h”; caused by re-pricing size minutes then reverted. |
| `/plan` remove from plan (row menu) | ✅ | — | — | ✅ | — | audited | `Remove` is hover-only; the three-dots menu works and the empty state returns after removal. |
| `/plan` planned-but-unsized issue | ✅ | — | — | ✅ | — | audited | FUN-4 planned 2 Nov but unsized: plan says nothing is planned and counts 0m (see “Planned issues without a size vanish…”). |
| `/plan` horizon modes (`?horizon=cycle|milestone|day`) | ✅ | — | — | ✅ | — | audited | Cycle/milestone 307 to `/plan`; day 307 to `/day`; no visible view tabs (see “Plan exposes only the week horizon…”). |
| `/plan` schedule/add issue action | ✅ | — | — | ✅ | — | audited | No add/schedule action in empty or populated state (see “Plan has no schedule/add-issue action…”). |
| `/day` empty day | ✅ | — | — | ✅ | — | audited | “No blocks yet”, 0 candidates, hour grid; Auto-plan/Clear day remain enabled. |
| `/day` candidates (1 sized issue) | ✅ | — | — | ✅ | — | audited | Candidate row with size/estimate/Add. |
| `/day` Auto-plan | ✅ | — | — | ✅ | — | audited | Blocks 09:00–13:00 + 13:00–17:00 buffer; totals and variance update. |
| `/day` block editing (start time, remove, clear day) | ◐ | — | — | ✅ | — | partial | Start-time input and Remove present; Clear-day confirmation not opened. |
| `/day` overlap error | ✅ | — | — | ✅ | — | audited | “Blocks overlap at 09:00” + Retry; retry cannot resolve (see “Day candidates remain addable…”). |
| `/day` overbooked state | ✅ | ✅ | ✅ | ✅ | ✅ | audited | 3h available vs 4h planned + 4h buffer → “Overbooked by 5h”; outside-hours warning. |
| `/day` horizontal overflow at 390 | — | — | ✅ | ✅ | — | audited | `scrollWidth` 664 at 390px; block controls off-screen (see “Day page overflows horizontally…”). |
| `/timeline` default (3 milestones) | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Bars, legend, axis, repo selector, milestone links, tooltip. Label rows clipped at ≥768 (see “Timeline milestone labels are clipped…”). |
| `/timeline` tooltip | ✅ | — | — | ✅ | — | audited | Hover bar → title, date window, progress, percentage. |
| `/timeline` repository scope | ✅ | — | — | ✅ | — | audited | `?repo=demo/funnel`; rows/count update; page-local selector coexists with navbar scope. |
| `/timeline` resize | ✅ | ✅ | ✅ | ✅ | — | audited | Canvas 1008 → 576 → 320px; chart scrolls inside `.timeline-scroll` at narrow widths. |
| `/timeline` undated milestones table | — | — | — | — | — | not reached | No demo milestone lacks a due date. |
| `/timeline` empty state | — | — | — | — | — | not reached | Both demo repositories contain milestones; no route to an empty plot. |
| Print / reduced motion | — | — | — | — | — | not audited | Out of scope. |

## Issue verification

- **#100 (OPEN)** — reproduced. The canvas is fixed at 60svh (540px at 1440x900; bottom ≈724) leaving ~176px of empty viewport and cutting the last In Progress card at the lane edge. Backlog reuses the same fixed box. See “Board canvas is pinned to 60svh…”.
- **#14 (CLOSED)** — no regression. Each lane body has `overflow-y: auto`, a real scroll range (e.g. In Progress `scrollHeight` 567 vs `clientHeight` 506), the lane header stays fixed after scroll, and the last card (FUN-6) becomes fully reachable at `scrollTop` 61. The remaining bottom-edge clipping is the #100 canvas/row alignment, not a lane-scroll failure.
- **#99 (OPEN)** — out of scope, but the Timeline page still has both the navbar “All repositories” scope and a page-local Repository select; they can disagree. Noted as an observation, not a finding.

## Untested areas and limitations

- **Loading/error states.** None of the planning routes expose a way to force a slow or failed load without editing source or intercepting the server; board lane loading/retry and plan/day error `InlineStatus` paths were only read in source.
- **Timeline empty and undated states.** Demo data has three dated milestones in two repositories; no undated milestone exists and no filter removes all milestones. Empty composition therefore unverified.
- **`/plan` cycles and milestones.** The routes redirect by design (see `plan/+page.server.ts`), so there was no cycle or milestone surface to audit.
- **Blocked/read-only board.** Demo user is admin; the RBAC `read` variant (no drag, no New Issue, no Remove) was not exercised.
- **Touch drag-and-drop.** Mobile screenshots verify layout only; pointer drag was exercised at 1440 with a mouse. Touch drag behaviour was not tested.
- **WIP limit enforcement.** Limits were configured and the over-limit display verified; whether a move is blocked or confirmed when it would exceed the cap was not tested (the display is advisory in source).
- **Destructive mutations were kept disposable.** One issue was rated in the matrix queue, one issue was sized/scheduled then cleared, one WIP limit was set, and one day was auto-planned on this instance only. Planning settings were restored to 2h for S after the over-capacity capture.
