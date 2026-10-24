# Time planning, estimates and capacity — spec

## 1. Estimates and settings

Size labels are Funnel's estimates. `planning.size_minutes` maps `sm`, `md` and `lg` to fixed integer minutes, defaulting to `120`, `240` and `480` (2h, 4h, 8h). The mapping is instance-wide and admin-editable; changing it re-prices every existing plan item because planned hours are derived from the issue's current size, never copied.

An issue with no size label is unestimated. Unestimated issues cannot be scheduled and are counted separately in the planner. `planning.allocation_percent` defaults to `60` and is an integer in `1..100`. `planning.cycle_weeks` defaults to `2` and is an integer in `1..52`. `planning.cycle_anchor` defaults to `2024-01-01`, the Monday that anchors cycle numbering, and must be a real Monday in `YYYY-MM-DD` form. `planning.maintainers` defaults to an empty list.

## 2. Week and cycle calendar

Weeks are ISO weeks: Monday 00:00 UTC through Sunday. A week is stored and exchanged as its Monday date in `YYYY-MM-DD` form. Conversion, arithmetic and validation are pure functions so the server and the tests agree.

A cycle is `planning.cycle_weeks` contiguous weeks counted from `planning.cycle_anchor`. Its key is its first Monday. A cycle exposes its start, end and ordered week list. Week and cycle views offer previous and next navigation; the default is the current week and its cycle.

## 3. Capacity model

A maintainer is a mirrored forge person with `weekly_minutes` net availability and an `active` flag, stored in `planning.maintainers` under `(forge, instance, external_id)`. Capacity for a period is `floor(weekly_minutes * weeks * allocation_percent / 100)`, so the default 60% reserves 40% for reviews, unplanned work and slack.

An issue's estimate is split evenly across its assignees that are active, configured maintainers; the integer remainder goes to the first such assignee. If no assignee matches, the issue's full estimate lands in an unassigned bucket that has no cap. Unestimated issues contribute nothing to committed hours and are reported separately. Plan items whose mirror issue is closed or no longer mirrored free their capacity.

A maintainer's lane reports the cap, committed minutes, remaining minutes, an over-cap flag and its issues. A lane is over when committed exceeds cap; a maintainer with `weekly_minutes: 0` therefore has zero usable capacity.

## 4. Scheduling and hard cap

Scheduling assigns one open, sized issue to one Monday week. The server checks the affected maintainers' lanes after applying the candidate and rejects the write with `409` when any would exceed its cap. The response names each violating maintainer with cap, projected committed minutes and excess. Moving an issue to another week frees its old week before the check. Re-scheduling to the same week is a no-op. Unscheduling is idempotent.

Scheduling is local only: it never writes to GitHub. A planned issue keeps its GitHub assignees, size and milestone as the source of truth. If a later GitHub edit pushes a maintainer over cap, the planner shows the over-cap state; only plan mutations are blocked.

## 5. Planning views

`/plan` is a read page for signed-in users with three horizons:

- **Week** — maintainer lanes for one Monday week, an unassigned bucket and the unestimated list.
- **Cycle** — aggregate lanes for the cycle plus a compact per-week breakdown.
- **Milestone** — read-only capacity for every open GitHub milestone with open issues. Capacity weeks are the weeks from now until the due date, rounded up with a minimum of zero; a milestone without a due date shows committed hours but no cap.

Every horizon exposes an "add issue" control for writers, a remove control per planned issue, and the same estimate and capacity vocabulary. The planner links each issue to its normal Inspector.

## 6. Maintainer roster and net hours

`/settings/planning` is admin-only. It edits the size map, allocation percentage, cycle length and anchor, and the maintainer roster. Maintainer candidates come from the assignable users of the configured repositories; an admin sets weekly hours, deactivates a row or removes it. Hours are entered as decimal hours and stored as minutes.

The weekly-hours field carries this hint verbatim: **Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.** The page never calls the value "gross hours".

## 7. API and access control

`PUT /api/repos/{owner}/{repo}/issues/{number}/plan` accepts `{ "week_start": "YYYY-MM-DD" }` and requires `write`. It returns `200 { item }`, `400` for an invalid body or unestimated/unowned issue, `404` when the issue is not mirrored, or `409 { message, violations }` when the cap would be exceeded. `DELETE` on the same path clears the plan item and returns `200 { cleared: true }`. Successful writes publish a `planning` event. The page is readable by `read`; the settings section requires `admin`.

## 8. Durable plan state

Plan items live in `state_plan_item`, keyed by `(org, name, issue_number)` with no foreign key to the disposable mirror. They therefore survive mirror pruning and `clearMirror`. Columns are `org`, `name`, `issue_number`, `week_start` (text Monday date), `created_at` and `updated_at` (Unix ms). An index on `week_start` supports week and cycle reads. The migration is additive; existing tables are untouched.

## 9. Documentation and operations

The release adds no environment variable and no external service. Documentation covers the new settings keys, the `state_plan_item` table, the two pages, the plan API, the planning glossary terms and a how-to for configuring estimates, net hours and weekly plans. The existing release step applies the additive migration; packaged binaries and containers need no extra action.
