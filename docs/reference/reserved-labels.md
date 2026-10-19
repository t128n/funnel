# Reserved labels

This page records Funnel's canonical reserved-label vocabulary, the one-label-per-group rule, absence semantics, conflict resolution, and label provisioning.

The canonical list is defined in `src/lib/labels.ts` and re-exported by the server provisioner in `src/lib/server/github/labels.ts`. There are eleven reserved labels. Colours are six-digit hexadecimal values without `#`, the format the GitHub labels API expects.

## Canonical labels

| Name | Group | Colour (hex, no `#`) | Description |
| :--- | :--- | :--- | :--- |
| `backlog` | `status` | `6f737a` | Status: Backlog |
| `todo` | `status` | `56a8f5` | Status: Todo |
| `in-progress` | `status` | `3574f0` | Status: In Progress |
| `in-review` | `status` | `b389f5` | Status: In Review |
| `blocked` | `flags` | `fa6675` | Flag: Blocked |
| `p1` | `priority` | `fa6675` | Priority: 1 (critical) |
| `p2` | `priority` | `cf8e6d` | Priority: 2 (high) |
| `p3` | `priority` | `6aab73` | Priority: 3 (normal) |
| `sm` | `size` | `6aab73` | Size: Small |
| `md` | `size` | `2aacb8` | Size: Medium |
| `lg` | `size` | `e28d78` | Size: Large |

## One label per group

An issue carries at most one label from each group. Status, priority, and size are single-valued workflow groups. `blocked` is an orthogonal flag: it belongs to its own group and can coexist with any status, priority, or size.

Writes that change a group read the issue's authoritative label set from GitHub, remove the group's existing members, and replace them with the requested label in one `PUT`. A write that supplies an ungrouped label set keeps the first reserved label encountered per group and drops later duplicates case-insensitively. Non-reserved labels are preserved.

`done` is not a reserved label. The board's Done column is derived from closed-as-completed issue state, not from a label.

## Absence semantics

| Group | Absence means |
| :--- | :--- |
| `status` | Untriaged. An open issue with no status label belongs to the Inbox. |
| `priority` | No priority. |
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

Only the eleven names in the canonical table are ever created or patched. Every other label, including `bug`, `frontend`, and domain tags, is preserved untouched. Failures are isolated per repository: one repository that cannot be provisioned is recorded and skipped while the remaining repositories still reconcile.

Writes run through the shared installation Octokit. The provisioning code expects Octokit's throttling to keep these writes to roughly one per second, so a repository missing all eleven labels takes roughly ten seconds to converge; a converged repository returns immediately.

## Related

- [Settings](./settings.md)
- [Roles and permissions](./roles-and-permissions.md)
- [Environment variables](./environment-variables.md)
- [Design](../DESIGN.md)
