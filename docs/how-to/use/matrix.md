# Use the matrix

This guide shows you how to read the impact × urgency matrix, find unassessed work, and use the **How to rate** guide to set both axes.

## Open the matrix

Select **Matrix** in the sidebar to open `/matrix`.

- The grid has four rows (impact) and four columns (urgency). The rows are `1` Severe, `2` Moderate, `3` Minor, then **Not assessed**; the columns are `1` High, `2` Mid, `3` Low, then **Not assessed**. The order is fixed.
- The page defaults to open issues and includes triaged and untriaged issues. It reuses the standard search, **All/Mine** scope and filter popover (repo, state, status, assignee, priority, size, label, milestone), so every dimension still applies.

## Read a cell

Each cell is a point in the grid.

- A cell where **both axes are assessed** shows the derived token — `P1 · High`, `P2 · Medium`, or `P3 · Low`.
- A cell where **both axes are absent** shows **No priority**.
- A cell where **exactly one axis is present** shows **Needs assessment** and is never labelled `P3`. The stored priority cache still holds the `P3` fallback for a partial pair; the matrix only relabels how it is shown.

Each cell shows its total and up to four preview issues, ordered by priority rank then most recently updated. The count always comes from the query, never from the previews.

## Find unassessed work

Work that has not been fully assessed hides inside the `P3` fallback everywhere else. The matrix makes it visible.

1. Look at the **Not assessed** row and column, and at the cells where only one axis is present. These are the **Needs assessment** and **No priority** cells.
2. Pick a cell, open one of its preview issues, and rate the missing axis in the Inspector.

## Use How to rate

Open the **How to rate** panel in the matrix header to see the five criteria for each level of both axes.

- Impact weighs **Reach**, **Data**, **Money**, **Locations** and **Workaround**.
- Urgency weighs **Harm**, **Exposure**, **Spread**, **Dependencies** and **Deadline**.

Rate each axis independently: impact from the effect on users and the business, urgency from the cost of waiting.

## Open an issue

Select a preview link in any cell. It opens `/matrix/{owner}/{repo}/{number}`, with the standard Inspector docked beside the grid. Use the **Priority** popover to set impact and urgency; priority stays derived.

## Related

- [Impact, urgency, and priority](../../reference/priority.md)
- [Routes and pages](../../reference/routes-and-pages.md)
- [The workflow model](../../explanation/workflow-model.md)
- [Create and edit issues](create-and-edit-issues.md)
