# Plan a week

This guide shows you how to commit work to a week and read the resulting capacity. Planning is a property of an issue, not a separate mode: you commit one open, sized issue to one Monday week from the issue's **Properties** panel, and `/plan` shows the per-maintainer capacity. It assumes planning is already configured; see [Configure estimates and weekly plans](../configure/planning.md) for the one-off setup.

![The week planner](../../assets/screenshots/plan-week.png)

![The Planned picker in the issue Properties panel](../../assets/screenshots/issue-planned.png)

## Open the week

Open **Plan** in the navigation bar. The page opens on the current week and shows one lane per active maintainer, the committed minutes against that person's cap, and the **Unassigned** and **Unestimated** buckets.

Use the arrows beside the week to move backwards or forwards. The URL carries the week (`/plan?week=YYYY-MM-DD`), so it can be bookmarked or shared.

## Schedule an issue

1. Open the issue from **Issues**, **Board**, **Inbox** or any other view.
2. In **Properties**, set **Planned** to **This week**, **Next week**, a nearby week, or a past week.
3. The issue is committed immediately. The control shows an inline error and rolls back if the server rejects it.

The issue appears in the lane of each active, configured maintainer among its assignees. If the issue has several assignees, the estimate is split evenly; the remainder goes to the first configured assignee. Scheduling requires at least one assignee who is active and configured. The picker explains the three blockers:

- **Closed** — closed issues cannot be planned.
- **Add a size** — an issue without a size label is unestimated and cannot be scheduled.
- **Assign an active maintainer** — an issue assigned only to unconfigured or inactive people is rejected with `400`.

![The Issues table with the Planned column](../../assets/screenshots/issues-planned.png)

The **Planned** column in the Issues list and the calendar marker on each board card show the committed week without opening the issue.

## Move or remove work

- To move an issue, change **Planned** to another week. The old week is freed before the new cap is checked.
- To remove it, set **Planned** to **Not planned**, or use the remove control on the issue row in `/plan`.
- Removing is idempotent.

## Handle the cap

Capacity is `floor(net weekly minutes × allocation percent / 100)`. With the default 60%, a maintainer with 20 net hours has 12 hours of issue capacity per week.

If a write would exceed a maintainer's cap, Funnel rejects it with `409` and names the maintainer, the cap, the projected committed minutes and the excess. The same check runs through the API, so a direct call cannot bypass it. The error appears beside the **Planned** picker; move the issue, shrink it, or remove something else.

The cap applies to plan mutations only. If a later GitHub edit — a new assignee or a larger size label — pushes a lane over, the planner shows the over-cap state but does not rewrite the plan.

## Read the other buckets

- **Unassigned** — work whose assignees have no active, configured capacity. It has no cap.
- **Unestimated** — open issues with no size label. They never contribute committed minutes.

## Plan your day

The week is the commitment; the day is the time box. **My Day** (`/day`) narrows the issues committed to the current week into an ALPEN hour grid and compares planned with actual time. See [Plan your day](../plan/plan-your-day.md).

## If the page is read-only

`read` viewers can see the week and all capacity but cannot change **Planned** or remove an issue. Ask an admin for `write` if you need to change the plan.

## Related

- [Configure estimates and weekly plans](../configure/planning.md) — the size map, net hours and allocation.
- [Planning and time reference](../../reference/planning-and-time.md) — formulas, periods, statuses and APIs.
- [Why planning and actuals work this way](../../explanation/planning-and-actuals.md) — the rationale and trade-offs.
- [Plan and track a week](../../tutorials/plan-and-track-a-cycle.md) — a guided first run.
