# Why planning and actuals work this way

Funnel already treats the forge as the source of truth for an issue's stage, size, assignees and milestone. Planning, actual time, delays and epics add a second kind of state: Funnel-owned observations and intent. This page explains the design choices behind that split.

## Three layers of state

The workflow now has three layers:

1. **Forge-owned facts** — labels, assignees, milestones, open/closed state and the body. Funnel mirrors them and treats them as authoritative.
2. **Funnel-owned observations and intent** — the plan item, the event log, delays and the epic child list. These are durable, local and never rewritten by a sync.
3. **Derived projections** — actual minutes, capacity lanes, epic rollups and the `/plan` page. They are recomputed from layers 1 and 2 on every read and stored nowhere.

Keeping the layers apart is what lets a GitHub edit propagate without losing the plan, and lets a re-sync rebuild the mirror without losing actuals.

## Estimates are derived, not copied

The size label is the estimate. `planning.size_minutes` maps `sm`, `md` and `lg` to minutes instance-wide, and the plan row stores only the week. Re-sizing an issue or changing the map re-prices every existing plan at once.

The alternative — copying minutes into the plan row — would make a five-minute label edit leave stale hours behind. Deriving the value keeps one source of truth and makes the estimate auditable from GitHub alone. It also means an unestimated issue cannot be silently planned at zero; it is listed separately until someone sizes it.

## Capacity is a human constraint

Capacity comes from people, not labels. Each maintainer has net weekly hours — contracted hours minus recurring meetings, on-call and other fixed commitments — and Funnel plans at most 60% of that by default. The remaining 40% is not idle: it covers reviews, unplanned work, incidents and the normal cost of coordination.

A hard cap on plan mutations makes the buffer real. Without it, a planner becomes a wish list: every lane fills to 100% and the first interruption breaks the cycle. Rejecting a write that would exceed the cap forces the choice — move work, shrink it, or consciously change the allocation — at the moment the plan is made, not after the sprint has failed.

The cap is deliberately not retroactive. GitHub remains authoritative for assignees and size, so a later edit can push a lane over. Funnel shows that state instead of rewriting the plan or blocking a GitHub edit it does not own. This is the same eventual-consistency trade-off as the rest of the mirror.

## Days narrow the week

A plan item records intent at week granularity; it does not say which hour. The **ALPEN** day view narrows one local day without becoming a second backlog: its candidates are the same open, sized issues from the Monday week, and a `state_day_block` is a timed placement of one of them. Working hours and blocked windows are personal, with `planning.work_defaults` as the instance fallback.

The buffer is emitted as explicit `buffer` blocks rather than subtracted at read time, so the reserved slack is visible on the grid and survives a manual edit. Auto-plan spends at most `available − buffer`; a manual plan may overrun the window and the UI flags it. Funnel enforces hours only when it is the one choosing the blocks. The [calendar feed](../how-to/plan/plan-your-day.md#subscribe-outlook-to-the-calendar-feed) is a read-only projection of the same blocks, so nothing flows back from Outlook.

## Actual time is observed, not reconstructed

Actual time is the union of open intervals whose status is `in-progress` or `in-review`. Both count because review is still time the team is carrying; the distinction between coding and waiting is useful, but neither is idle.

The event log starts at deployment (a migration baseline) or at first observation for a new issue. It is not backfilled from the forge timeline. That is a deliberate choice. A timeline-based reconstruction would mix guesses about label timing into a number the planner and reports rely on, and the forge does not expose a reliable per-status history through the mirror's polling. Starting from the migration timestamp is honest: the data is complete from the moment Funnel began watching, and partial for older work. The UI says so rather than presenting a confident wrong number.

The event log also keeps the raw transitions, not just totals. That makes it possible to change the arithmetic later — for example, to exclude a status or split review time — without losing the history.

## The timeline is a projection

The `/timeline` view answers one question — will this milestone land on its due date? — without adding a second schedule to maintain. It stores nothing, and there are no per-issue start or end dates to keep up to date. A bar is computed on read from three facts Funnel already holds: the Monday week an issue was planned into, the first instant the event log observed it in `in-progress` or `in-review`, and the milestone's mirrored due date. The earlier of the first two is the start; the due date is the end. Progress is the same closed/total count the milestone list shows.

The obvious alternative is a per-issue `start_on` and `target_on` pair, or a separate timeline entity with its own dates. Either would be a second schedule: another place where someone has to keep an estimate aligned with the plan and the forge, and a number that goes stale as soon as an issue is rescheduled or its status moves. Deriving the axis means the chart cannot disagree with the plan or the event log. It can only be as current as the mirror, which is the same guarantee every other page gives.

The cost is coarseness. A planned issue starts at its Monday, not at an hour, and an issue that was never planned and has never moved has no start at all. That is deliberate. Inventing a start from the last plan week, the issue's creation date, or today would make the chart look more certain than the underlying data.

The same rule governs absent dates. A milestone with no due date has no end to draw, so it is left out of the Gantt and listed in a `No due date` table instead of being given an invented end. A milestone whose issues have no plan week and no observed transition gets a due-date tick and a `No start` label instead of a bar spanning an imaginary duration. A plan week after the due date is shown as `After due`, not clamped to fit. Showing the gap is more useful than hiding it behind a plausible-looking bar.

The view is read-only for the same reason. There is no drag-to-reschedule and no date picker because the dates it draws are not its own. Moving a bar would either write a per-issue date that does not exist or silently desynchronise the plan. To change the picture, change the inputs: plan the issue, move it through the workflow, or correct the milestone on GitHub. The Gantt is rendered with Apache ECharts; its HTML milestone column is the accessible list, and the chart and the list share the same row heights. The full contract is in the [milestone timeline plan](../plans/2026-11-02-milestone-timeline.md); the task is [Use milestones](../how-to/use/milestones.md#read-the-timeline).

## Delays are intervals with reasons

A delay is not a status. It is an interval with a reason, an optional note and a source. Keeping it separate from the status vocabulary means an issue can be in progress and delayed at the same time, which is what “blocked but still being worked around” actually looks like.

Automatic delays follow the existing `blocked` flag, so the team does not maintain two sources of truth for the same wait. The reason is captured in the block metadata at the moment the blocker is recorded, when the person knows it. Manual delays cover waits that never became a `blocked` flag — a review slot, a missing answer, a dependency that was resolved before anyone labelled it.

Delays are intervals rather than a single “delayed” flag because work can wait more than once, for different reasons. Overlaps are merged for the total, but the individual rows keep the reason and the note. Closing the issue closes every open delay; reopening a still-blocked issue opens a new interval rather than reviving the old one, so the gap is visible.

## Epics are containers in the body

An epic is an ordinary issue carrying the `epic` label. The children live in the epic issue's trailing `funnel_metadata` envelope as a comma-separated list of `owner/name#number` references.

Putting the relation in the body, rather than a Funnel-only membership table, keeps it portable: it survives a mirror rebuild, is visible on GitHub, and does not depend on a database row that another tool cannot see. The trade-off is that the envelope is an HTML comment, so the relation is structured but not rendered on GitHub, and a manual body edit can drift from what the UI shows. Funnel validates refs on read and rejects self, nested and duplicate children on write.

The label is separate from the child list. Marking an issue as an epic is a normal reserved-label write and can be done from GitHub; adding children is a Funnel body edit. Removing the label leaves the body untouched, so re-adding it restores the relation.

Funnel does not use GitHub sub-issues. The forge abstraction does not expose them, and a local body relation works across configured repositories and every supported forge. The cost is that GitHub's own sub-issue UI does not show the relation; the benefit is that the feature is not tied to one forge's issue model.

## What this design optimises

- **Portability** — the estimate is a label, the epic relation is in the body, and the plan is local but keyed by forge identity.
- **Honesty** — actuals say when tracking started; they do not invent history.
- **A real buffer** — the 60% cap is enforced, not advisory.
- **Durability** — plan items, events and delays survive mirror pruning and re-sync.
- **One source of truth per fact** — GitHub owns the workflow; Funnel owns the intent and the observations.

The costs are the ones the model accepts elsewhere: the mirror is eventually consistent, a body edit can drift, the cap can be exceeded by a later GitHub change, and actuals are partial for work that predates deployment.

## Related

- [Planning and time reference](../reference/planning-and-time.md) — exact values and contracts.
- [Plan a week or cycle](../how-to/use/plan-work.md) — the task.
- [Track time and delays](../how-to/use/track-time-and-delays.md) — the delay rules.
- [Manage epics](../how-to/use/epics.md) — the child-list workflow.
- [Use milestones](../how-to/use/milestones.md#read-the-timeline) — reading the Gantt timeline.
- [Milestone timeline plan](../plans/2026-11-02-milestone-timeline.md) — the projection contract.
- [The workflow model](./workflow-model.md) — labels, priority and the board.
