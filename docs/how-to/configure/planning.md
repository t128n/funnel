# Configure estimates and weekly plans

Set the instance-wide size-to-time estimates, choose how much of a maintainer's week Funnel may plan, and schedule sized issues into Monday weeks.

Only an administrator can open **Settings → Planning**; other roles receive a 403 on a direct URL, and the save action checks the role again server-side. The planner itself, `/plan`, is readable by every signed-in user.

## What the planner is for

Funnel already knows an issue's size label, assignees and milestone from GitHub. Planning adds one Funnel-owned layer on top: a **plan item** that schedules one open, sized issue into one Monday week. Planning never writes to GitHub. An issue keeps its GitHub assignees, size and milestone as the source of truth, and a change made there is reflected in the planner on the next sync.

A week is an ISO week in UTC: Monday 00:00 through Sunday, identified by its Monday date in `YYYY-MM-DD` form. A cycle is a fixed number of contiguous weeks counted from an anchor Monday.

## Estimates

`planning.size_minutes` maps the three size labels to fixed integer minutes:

| Size label | Default minutes | Default hours |
| :--- | :--- | :--- |
| `sm` | `120` | 2h |
| `md` | `240` | 4h |
| `lg` | `480` | 8h |

The mapping is instance-wide. Changing it re-prices every existing plan item at once, because planned hours are always derived from the issue's current size and are never copied into the plan row.

An issue without a size label is **unestimated**. Unestimated issues cannot be scheduled; the planner lists them separately so they can be sized from the Inspector first.

## Net hours

A maintainer is a mirrored forge person in `planning.maintainers` with a `weekly_minutes` value and an `active` flag. Enter availability in decimal hours; Funnel stores integer minutes.

The weekly-hours field carries this hint verbatim: **Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.**

Capacity for a period is `floor(weekly_minutes * weeks * allocation_percent / 100)`. The default `planning.allocation_percent` of `60` therefore leaves 40% of the entered net hours free for reviews, unplanned work and slack. A maintainer with `weekly_minutes: 0` has zero usable capacity.

An issue's estimate is split evenly across its assignees that are active, configured maintainers; the remainder goes to the first such assignee. If no assignee matches, the estimate lands in an unassigned bucket that has no cap. Unestimated issues contribute nothing to committed hours.

## Cycle shape

- `planning.cycle_weeks` is the cycle length, an integer in `1..52`. Default `2`.
- `planning.cycle_anchor` is the Monday that anchors cycle numbering, in `YYYY-MM-DD` form. Default `2024-01-01`. Any other weekday is rejected.

A cycle's key is its first Monday, and it exposes its start, end and ordered week list. Weeks before the anchor floor into negative cycles, so historical plan items keep stable windows instead of being clamped onto the anchor's cycle.

## Steps

1. Open **Settings → Planning**.
2. Set the minutes for Small, Medium and Large, or keep the 2h/4h/8h defaults.
3. Set the allocation percentage (`1`–`100`) and the cycle length (`1`–`52`).
4. Set the cycle anchor to a real Monday.
5. Add maintainers from the assignable users of the configured repositories, entering each one's net weekly hours. Deactivate or remove a row to take that person out of the capacity model.
6. Select **Save changes**.
7. Open **Plan** and pick a week, a cycle or a milestone horizon.

## Scheduling issues

A writer can schedule an issue from `/plan` with **Schedule issue**: the dialog searches open, sized, unplanned issues and posts the chosen Monday week. Scheduling also requires at least one assignee who is an active, configured maintainer; an issue assigned only to unconfigured or inactive people is rejected with `400`. Moving an issue to another week frees its old week before the cap is checked. Re-scheduling to the same week is a no-op, and removing a plan item is idempotent.

The allocation cap is hard. Before writing, the server checks the affected maintainers' lanes after applying the candidate and rejects the write with `409` when any lane would exceed its cap. The response names each violating maintainer with the cap, projected committed minutes and excess. The same limits are enforced by `PUT /api/repos/{owner}/{repo}/issues/{number}/plan`, so a direct API call cannot bypass them.

The cap applies only to plan mutations. If a later GitHub edit — a new assignee, a larger size label — pushes a maintainer over cap, the planner shows the over-cap lane but does not reverse anything.

## What the horizons show

- **Week** — one Monday week's maintainer lanes, an unassigned bucket and the unestimated list.
- **Cycle** — aggregate lanes for the whole cycle plus a compact per-week breakdown.
- **Milestone** — read-only capacity for every open milestone with open issues. Capacity weeks run from now to the due date, rounded up with a minimum of zero; a milestone with no due date shows committed hours but no cap.

Plan items survive mirror pruning and `clearMirror` because they are keyed by `owner/name` plus issue number. A plan item whose mirror issue is closed or no longer mirrored frees its capacity.

## After saving

Funnel validates and persists the values, drops the cached configuration, and broadcasts a `settings` event. Open planners re-query with the new estimates and caps; a restart is not needed.

## Related

- [Settings reference](../../reference/settings.md) — every `planning.*` key with defaults and validation.
- [Database schema](../../reference/database-schema.md#state_plan_item) — the `state_plan_item` table.
- [HTTP API](../../reference/http-api.md#planning) — the plan endpoint.
- [The workflow model](../../explanation/workflow-model.md) — where planning sits next to labels.
- [Reserved labels](../../reference/reserved-labels.md) — the size vocabulary.
