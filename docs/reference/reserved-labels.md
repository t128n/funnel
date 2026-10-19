# Reserved labels

This page records Funnel's canonical reserved-label vocabulary, the one-label-per-group rule, absence semantics, conflict resolution, and label provisioning.

The canonical list is defined in `src/lib/labels.ts` and re-exported by the server provisioner in `src/lib/server/github/labels.ts`. There are eight reserved labels. Colours are six-digit hexadecimal values without `#`, the format the GitHub labels API expects.

## Canonical labels

| Name | Group | Colour (hex, no `#`) | Description |
| :--- | :--- | :--- | :--- |
| `backlog` | `status` | `6f737a` | Status: Backlog |
| `todo` | `status` | `56a8f5` | Status: Todo |
| `in-progress` | `status` | `3574f0` | Status: In Progress |
| `in-review` | `status` | `b389f5` | Status: In Review |
| `blocked` | `flags` | `fa6675` | Flag: Blocked |
| `sm` | `size` | `6aab73` | Size: Small |
| `md` | `size` | `2aacb8` | Size: Medium |
| `lg` | `size` | `e28d78` | Size: Large |

## Retired priority labels

`p1`, `p2`, and `p3` are retired. Priority is now derived from the durable
**impact** and **urgency** axes, so the labels are neither provisioned nor
written. Existing labels are read once to seed a missing priority row and are
otherwise treated as stale: a label that disagrees with the derived value sets
`label_conflict`, exactly like an ambiguous reserved-label conflict. See
[Impact, urgency, and priority](./priority.md).

## One label per group

An issue carries at most one label from each active group. Status and size are
single-valued workflow groups. `blocked` is an orthogonal flag: it belongs to its
own group and can coexist with any status or size. Priority is no longer a label
group.

Writes that change a group read the issue's authoritative label set from GitHub, remove the group's existing members, and replace them with the requested label in one `PUT`. A write that supplies an ungrouped label set keeps the first reserved label encountered per group and drops later duplicates case-insensitively. Non-reserved labels are preserved.

`done` is not a reserved label. The board's Done column is derived from closed-as-completed issue state, not from a label.

## Absence semantics

| Group | Absence means |
| :--- | :--- |
| `status` | Untriaged. An open issue with no status label belongs to the Inbox. |
| `size` | Unestimated. |
| `flags` | Not flagged. |

Closing an issue does not by itself add a reserved label.

## Conflict resolution

If an issue carries more than one label from a group, the sync worker resolves the conflict with the App installation token:

- The issue timeline is fetched and reduced to `labeled` events.
- For each conflicted group, the label with the newest `labeled` timestamp among the group's current labels wins.
- The other labels in that group are deleted on GitHub, and the mirror's metadata is recomputed from the surviving labels.
- Only reserved labels participate; other labels are ignored.

A timeline is ambiguous when no `labeled` event exists for the conflicted group, or when two candidates tie for the newest timestamp. In that case Funnel removes nothing, leaves the labels untouched, and sets `mirror_github_issue.label_conflict` so the UI can flag the issue. While a conflict is unresolved, the read projection chooses the first label in canonical order.

## Idempotent provisioning

Provisioning reconciles the canonical labels in every configured repository:

- At startup, before the server answers its first request. It is skipped during `vite build`/prerender, and failures are logged without blocking or crashing startup.
- During nightly reconciliation, scheduled for 03:00 local time and re-armed after each run.

For each repository, the provisioner lists all labels, matches existing labels case-insensitively, creates missing canonical labels, patches canonical labels whose colour or description has drifted, and leaves correct labels unchanged. A converged repository issues zero writes.

Only the eight names in the canonical table are ever created or patched. Every other label, including `bug`, `frontend`, and domain tags, is preserved untouched. Failures are isolated per repository: one repository that cannot be provisioned is recorded and skipped while the remaining repositories still reconcile.

Writes run through the shared installation Octokit. The provisioning code expects Octokit's throttling to keep these writes to roughly one per second, so a repository missing all eight labels takes roughly eight seconds to converge; a converged repository returns immediately.

## Related

- [Settings](./settings.md)
- [Roles and permissions](./roles-and-permissions.md)
- [Environment variables](./environment-variables.md)
- [Design](../DESIGN.md)
