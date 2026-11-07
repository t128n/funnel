# Use the matrix

This guide shows you how to read the impact × urgency matrix, find work that still needs a rating, and rate both axes.

Sign in to browse mirrored issues. Rating them requires `write` or `admin` and a GitHub token permitted to edit the issue.

## Open the matrix

Select **Matrix** in the sidebar to open `/matrix`.

- The page header carries the scoped issue count, search, **All/Mine** scope, filters, and the **Rating Guide**.
- The matrix has nine cells: impact rows **Severe**, **Moderate**, **Minor** crossed with urgency columns **High**, **Mid**, **Low**. The order is fixed.
- The page defaults to open issues and includes triaged and untriaged issues. Every filter dimension still applies.

## Read the assessment summary

The summary sits directly below the toolbar and above the matrix.

- **Needs assessment** counts issues missing an impact and/or urgency. Select **Review queue** to rate them.
- **Rated issues** counts issues with both axes assigned, so they appear in the matrix.

Both counts come from the same scoped dataset as the grid, so search, scope, and filters change them together.

## Read the matrix

Each cell shows the derived priority and the number of matching issues. The issue count is the main value; the priority is a compact label beside it.

| Impact / Urgency | High | Mid | Low |
| :--- | :--- | :--- | :--- |
| Severe | **P1** | **P1** | P2 |
| Moderate | **P1** | P2 | P3 |
| Minor | P2 | P3 | P3 |

- An empty cell shows `0` and stays selectable.
- Selecting a cell opens its issue list in the details pane on the right (below the matrix on narrow screens).
- Use the arrow keys to move between cells; press Enter or Space to select. The selected cell also carries a non-color selection indicator.

## Rate unassessed work

1. Select **Review queue** in the assessment summary. The action is available to users who can write.
2. Set the missing impact or urgency. An axis that is already set is kept as-is.
3. When both axes are present, the issue leaves the queue, joins its matrix cell, and the counts update.

Selecting a cell is only navigation; issues move between cells when their ratings change.

If an issue is missing, check the search, scope and filters; an issue without both ratings remains in **Needs assessment** rather than a cell. If a write fails, check the displayed error and retry after correcting it.

## Open an issue

Select an issue in the selected cell's list. It opens `/matrix/{owner}/{repo}/{number}`, with the standard Inspector docked beside the matrix (or full width on narrow screens).

Use the **Priority** control in the Inspector to set impact and urgency; priority stays derived. Closing the Inspector returns you to the same selected cell.

## Use Rating Guide

Open **Rating Guide** in the toolbar to see the five criteria for each level of both axes.

- Impact weighs **Reach**, **Data**, **Money**, **Locations** and **Workaround**.
- Urgency weighs **Harm**, **Exposure**, **Spread**, **Dependencies** and **Deadline**.

Rate each axis independently: impact from the effect on users and the business, urgency from the cost of waiting.

## Related

- [Impact, urgency, and priority](../../reference/priority.md)
- [Routes and pages](../../reference/routes-and-pages.md)
- [The workflow model](../../explanation/workflow-model.md)
- [Create and edit issues](create-and-edit-issues.md)
- [Plan a week](plan-work.md)
