# Reserved labels

This page records Funnel's canonical reserved-label vocabulary, the one-label-per-group rule, absence semantics, conflict resolution, and label provisioning.

The canonical list is defined in `src/lib/labels.ts` and re-exported by the server provisioner in `src/lib/server/github/labels.ts`. There are fifteen reserved labels. Colours are six-digit hexadecimal values without `#`, the format the GitHub labels API expects.

## Logical keys and actual names

Each reserved label has two identities:

- The **logical key** (`base`) is stable and never prefixed: `backlog`, `todo`, `in-progress`, `in-review`, `sm`, `md`, `lg`, and so on. The mirror columns, filters, URL parameters, client options and the HTTP API all use this key.
- The **actual GitHub name** is what Funnel provisions and writes. Without a prefix it equals the logical key (`todo`); with `labels.prefix = "funnel"` it is `funnel-todo`.

`deriveMetadata` recognizes actual names and stores the logical key, so changing the prefix does not change the mirror schema or require a database migration. The UI displays human names ("Todo", "Small") and sends logical values; anywhere it shows a raw GitHub label, it shows the actual, prefixed name.

## Prefixing the vocabulary

The global prefix is the `labels.prefix` setting, edited at **Settings → Labels** by an administrator. The default is empty, which keeps today's names exactly. A prefix applies to every reserved label; there are no per-group prefixes or full vocabulary overrides.

| Logical key | Default actual name | With `labels.prefix = "funnel"` |
| :--- | :--- | :--- |
| `backlog` | `backlog` | `funnel-backlog` |
| `todo` | `todo` | `funnel-todo` |
| `in-progress` | `in-progress` | `funnel-in-progress` |
| `in-review` | `in-review` | `funnel-in-review` |
| `blocked` | `blocked` | `funnel-blocked` |
| `sev` / `mod` / `min` | `sev` / `mod` / `min` | `funnel-sev` / `funnel-mod` / `funnel-min` |
| `high` / `mid` / `low` | `high` / `mid` / `low` | `funnel-high` / `funnel-mid` / `funnel-low` |
| `sm` / `md` / `lg` | `sm` / `md` / `lg` | `funnel-sm` / `funnel-md` / `funnel-lg` |
| `epic` | `epic` | `funnel-epic` |

Validation on save: the value is trimmed and trailing hyphens are dropped, so `funnel-` and `funnel` both yield `funnel-todo`. It must be at most 32 characters and contain only letters, digits and single hyphens (`^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$`); whitespace, slashes, underscores and repeated hyphens are rejected. The resulting fifteen names must be unique. Errors appear inline on the Labels settings page.

Because URL parameters and API bodies keep the logical keys, a prefixed instance still uses `?status=todo`, `?size=sm`, and `{ "status": "todo" }`. Only the labels written to GitHub change.

## Only-new migration

Changing the prefix never renames, patches or deletes existing GitHub labels. Funnel's provisioner and sync only consider the currently configured set:

- Old reserved names become ordinary labels. With `funnel` configured, an existing `todo` label is no longer recognized as the status group and is displayed as an ordinary label.
- Funnel provisions the newly named set (`funnel-todo`, ...) on the next provisioning cycle, which runs at startup and during nightly reconciliation. You can also trigger a sync from the instance to converge sooner.
- Existing issues keep their old labels until someone relabels them. Their cached status/impact/urgency/size become unset on the next hydration because the old names no longer map to the vocabulary.

Manual migration after changing the prefix:

1. Let Funnel provision the new set, or create the labels manually with the same colours and descriptions (see the table above).
2. For each issue that carried a reserved label, add the corresponding prefixed label and remove the old one. Issue edits through the cockpit write the new names; bulk edits can use GitHub's label tools or API.
3. Confirm the mirror shows the expected status/size after the next poll. The old names can then be deleted from each repository manually; Funnel will not do that.
4. Clearing the prefix later follows the same rules in reverse: the unprefixed names become reserved again, and the prefixed names become ordinary labels.

## Canonical labels

| Name | Group | Colour (hex, no `#`) | Description |
| :--- | :--- | :--- | :--- |
| `backlog` | `status` | `6f737a` | Status: Backlog |
| `todo` | `status` | `56a8f5` | Status: Todo |
| `in-progress` | `status` | `3574f0` | Status: In Progress |
| `in-review` | `status` | `b389f5` | Status: In Review |
| `blocked` | `flags` | `fa6675` | Flag: Blocked |
| `sev` | `impact` | `fa6675` | Impact: Severe |
| `mod` | `impact` | `cf8e6d` | Impact: Moderate |
| `min` | `impact` | `6aab73` | Impact: Minor |
| `high` | `urgency` | `f87171` | Urgency: High |
| `mid` | `urgency` | `facc15` | Urgency: Mid |
| `low` | `urgency` | `94a3b8` | Urgency: Low |
| `sm` | `size` | `6aab73` | Size: Small |
| `md` | `size` | `2aacb8` | Size: Medium |
| `lg` | `size` | `e28d78` | Size: Large |
| `epic` | `epic` | `b389f5` | Type: Epic |

## Retired priority labels

`p1`, `p2`, and `p3` are retired. Priority is derived from the **impact** and
**urgency** labels, so the p-labels are neither provisioned nor written. A
retired label that disagrees with the derived value — or more than one retired
label — sets `label_conflict`, exactly like an ambiguous reserved-label
conflict. See [Impact, urgency, and priority](./priority.md).

## One label per group

An issue carries at most one label from each active group. Status, impact,
urgency and size are single-valued workflow groups. `blocked` is an orthogonal
flag: it belongs to its own group and can coexist with any other group. `epic`
is an orthogonal membership marker in its own `epic` group: it is independent of
status, size and the `blocked` flag, so an epic can be triaged and sized like any
other issue. Priority is not a label group.

Writes that change a group read the issue's authoritative label set from GitHub, remove the group's existing members, and replace them with the requested label in one `PUT`. A write that supplies an ungrouped label set keeps the first reserved label encountered per group and drops later duplicates case-insensitively. Non-reserved labels are preserved.

`done` is not a reserved label. The board's Done column is derived from closed-as-completed issue state, not from a label.

## Absence semantics

| Group | Absence means |
| :--- | :--- |
| `status` | Untriaged. An open issue with no status label belongs to the Inbox. |
| `impact` | Not assessed. |
| `urgency` | Not assessed. |
| `size` | Unestimated. |
| `flags` | Not flagged. |
| `epic` | Not an epic. The issue is ordinary work, not a container for children. |

Closing an issue does not by itself add a reserved label.

## Conflict resolution

If an issue carries more than one label from a group, the sync worker resolves the conflict with the App installation token:

- The issue timeline is fetched and reduced to `labeled` events.
- For each conflicted group, the label with the newest `labeled` timestamp among the group's current labels wins.
- The other labels in that group are deleted on GitHub, and the mirror's metadata is recomputed from the surviving labels.
- Only reserved labels participate; other labels are ignored. Names are matched against the configured vocabulary, so old unprefixed names do not participate once a prefix is set.

A timeline is ambiguous when no `labeled` event exists for the conflicted group, or when two candidates tie for the newest timestamp. In that case Funnel removes nothing, leaves the labels untouched, and sets `mirror_thread.label_conflict` so the UI can flag the issue. While a conflict is unresolved, the read projection chooses the first label in canonical order.

## Idempotent provisioning

Provisioning reconciles the canonical labels in every configured repository:

- At startup, before the server answers its first request. It is skipped during `vite build`/prerender, and failures are logged without blocking or crashing startup.
- During nightly reconciliation, scheduled for 03:00 local time and re-armed after each run.

For each repository, the provisioner lists all labels, matches existing labels case-insensitively, creates missing canonical labels, patches canonical labels whose colour or description has drifted, and leaves correct labels unchanged. A converged repository issues zero writes.

Only the fifteen names in the configured vocabulary are ever created or patched. Every other label, including `bug`, `frontend`, domain tags, and old reserved names from before a prefix change, is preserved untouched. Failures are isolated per repository: one repository that cannot be provisioned is recorded and skipped while the remaining repositories still reconcile.

Writes run through the shared installation Octokit. The provisioning code expects Octokit's throttling to keep these writes to roughly one per second, so a repository missing all fifteen labels takes roughly fifteen seconds to converge; a converged repository returns immediately.

## Related

- [Settings](./settings.md)
- [Roles and permissions](./roles-and-permissions.md)
- [Environment variables](./environment-variables.md)
- [Design](../DESIGN.md)
