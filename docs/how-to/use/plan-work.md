# Plan a week or cycle

This guide shows you how to schedule issues into a week or cycle, move work between weeks, and deal with the 60% capacity cap. It assumes planning is already configured; see [Configure estimates and weekly plans](../configure/planning.md) for the one-off setup.

![The week planner](../../assets/screenshots/plan-week.png)

## Open the horizon you need

Open **Plan** in the workspace sidebar. The page opens on the current week.

- **Week** shows one Monday week. Use it when you are levelling work inside a cycle.
- **Cycle** aggregates the configured number of weeks and adds a per-week breakdown.
- **Milestone** is read-only capacity for open GitHub milestones with open issues.
- **Day** is the ALPEN view for one local date: the same planned issues, placed into timed blocks with a buffer. See [Plan your day](../plan/plan-your-day.md).

Use the arrows beside the period to move backwards or forwards. The URL carries the period, so you can bookmark or share it.

## Schedule an issue

1. Select **Schedule issue**.
2. Search for an open, sized issue that is not already planned.
3. Choose the Monday week.
4. Confirm.

The issue appears in the lane of each active, configured maintainer among its assignees. If the issue has several assignees, the estimate is split evenly; the remainder goes to the first configured assignee. Scheduling requires at least one assignee who is active and configured. An issue assigned only to unconfigured or inactive people is rejected with `400`; an already-planned issue whose assignees later change can fall into **Unassigned**.

If the issue has no size label it cannot be scheduled. It appears under **Unestimated**; set a size in the Inspector first.

## Move or remove work

- To move an issue, schedule it into another week. The old week is freed before the new cap is checked.
- To remove it, use the remove control on the issue row. Unscheduling is idempotent.
- Re-scheduling an issue into the same week is a no-op.

## Handle the cap

Capacity is `floor(net weekly minutes × weeks × allocation percent / 100)`. With the default 60%, a maintainer with 20 net hours has 12 hours of issue capacity per week.

If a write would exceed a maintainer's cap, Funnel rejects it with `409` and names the maintainer, the cap, the projected committed minutes and the excess. The same check runs through the API, so a direct call cannot bypass it.

The cap applies to plan mutations only. If a later GitHub edit — a new assignee or a larger size label — pushes a lane over, the planner shows the over-cap state but does not rewrite the plan.

## Read the other buckets

- **Unassigned** — work whose assignees have no active, configured capacity. It has no cap.
- **Unestimated** — open issues with no size label. They never contribute committed minutes.
- **Milestone** — committed hours against the weeks from now to the milestone due date. A milestone without a due date shows committed hours but no cap.

## If the page is read-only

`read` viewers can see every horizon and all capacity but cannot schedule or remove issues. Ask an admin for `write` if you need to change the plan.

## Related

- [Configure estimates and weekly plans](../configure/planning.md) — the size map, net hours, cycle shape and allocation.
- [Planning and time reference](../../reference/planning-and-time.md) — formulas, periods, statuses and APIs.
- [Why planning and actuals work this way](../../explanation/planning-and-actuals.md) — the rationale and trade-offs.
- [Plan a cycle and track it](../../tutorials/plan-and-track-a-cycle.md) — a guided first run.
