# Manage epics

An epic groups related issues under one container so you can see progress and time across the whole body of work. This guide explains how to mark an epic, manage its children, and read the rollups.

## What an epic is

An epic is an ordinary issue carrying the reserved `epic` label. It has a normal status, priority, size and assignees, and it can be blocked like any other issue. The label is orthogonal: it does not change the stage or add a board column.

Any writer can mark an issue as an epic from the Inspector:

1. Open the issue.
2. In the epic property, choose **Mark as epic**.
3. The issue gains the `epic` label and shows an **Epic** badge linking to its epic page.

**Remove epic** takes the label away but leaves the children list in the issue body untouched. The API equivalent is `PUT /api/repos/{owner}/{repo}/issues/{number}/epic` with `{ "is_epic": true }` or `{ "is_epic": false }`.

## How children are stored

The child list lives in the epic issue's trailing `<!-- funnel_metadata -->` envelope, not in a membership table:

```markdown
<!-- funnel_metadata
epic:
  children: "orgA/core#12,orgA/web#3"
-->
```

The `children` value is a single comma-separated scalar of `owner/name#number` references, kept in order. It is the source of truth: adding or removing a child rewrites only the `epic:` section and preserves every other metadata section, such as `blocked`. The envelope is an HTML comment, so it does not appear in the rendered description.

Because the list lives in the issue body, the relation is portable: it is visible on GitHub, survives a mirror rebuild, and does not depend on Funnel's database. Children may come from any configured repository. Malformed refs and self references are dropped when the list is read.

An issue should belong to one epic. Adding a child that another epic already lists is rejected, and an epic cannot contain another epic (no nested epics).

## Add and remove children

Add children from the epic page, not from the child issue:

1. Open **Epics** in the sidebar.
2. Select the epic, or open `/epics/{owner}/{repo}/{number}`.
3. Choose **Add child**.
4. Search the open issues that are not already in another epic.
5. Select one. Funnel sends the complete ordered list, so the new child joins the existing ones.

Remove a child from the epic page's child table. Removal sends the list without that issue, which edits the epic body. The child itself is unchanged; only its membership is removed.

The API equivalent is `PUT /api/repos/{owner}/{repo}/issues/{number}/epic/children` with `{ "children": ["orgA/core#12", "orgA/web#3"] }`, which replaces the whole list. An empty array clears the section. Both the label toggle and the children write use the signed-in user's GitHub token and publish an `issues` event on success.

## Read progress and rollups

`/epics` lists epics with open epics before closed ones. Each row shows progress (closed children over total children) and the summed estimate, actual time and delay time.

The epic detail page shows:

- the epic issue itself, with its own status and time;
- rollup cards for progress, estimate, actual and delay;
- the ordered child table with each child's status, assignees, estimate, actual and delay.

Children are resolved by parsing the epic body on every read. A child that is missing, pruned or no longer mirrored is skipped from the rollups and shown as unavailable rather than breaking the page. The rollups use the same estimate mapping and actual/delay calculators as the Inspector, so an epic's totals match the sum of its visible children.

## Access

Every signed-in user with `read` can view `/epics` and the detail page. Marking or removing the epic label, and adding or removing children, require `write`. Read-only viewers see the badge, links and rollups without the edit controls.

## Related

- [Track time and delays](track-time-and-delays.md) — how child actual time is measured.
- [Create and edit issues](create-and-edit-issues.md) — editing labels and properties.
- [Reserved labels](../../reference/reserved-labels.md) — the `epic` label and its group.
- [HTTP API](../../reference/http-api.md#epics-and-delays) — the epic endpoints.
- [The workflow model](../../explanation/workflow-model.md#epics-are-containers-in-the-body) — why children live in the body.
