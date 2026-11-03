# Planning and time reference

This page describes the facts behind `/plan`, actual time, delays and epics. It does not explain why the design works this way — see [Why planning and actuals work this way](../explanation/planning-and-actuals.md) — and it does not give step-by-step instructions — see [Plan a week](../how-to/use/plan-work.md).

## Settings

| Key | Type | Default | Validation | Effect |
| :--- | :--- | :--- | :--- | :--- |
| `planning.size_minutes` | Object of `sm`, `md`, `lg` to integer minutes | `{ "sm": 120, "md": 240, "lg": 480 }` | Each value is an integer from `1` to `10080`. | Fixed estimate for each size label. |
| `planning.allocation_percent` | Integer | `60` | `1`–`100`. | Share of net weekly hours that plan items may fill. |
| `planning.cycle_weeks` | Integer | `2` | `1`–`52`. | Legacy stored config; no surface uses it. |
| `planning.cycle_anchor` | String `YYYY-MM-DD` | `2024-01-01` | Must be a real Monday. | Legacy stored config; anchors the retained cycle helpers. |
| `planning.maintainers` | Array of maintainer objects | `[]` | Unique `(forge, instance, external_id)`; `weekly_minutes` integer `0`–`10080`; `active` boolean. | People whose net hours make up capacity. |

A maintainer object has `forge`, `instance`, `external_id`, `login`, `avatar_url`, `weekly_minutes` and `active`. Hours are entered in decimal and stored as integer minutes.

The weekly-hours field carries this hint: **Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.**

## Weeks

- A week is an ISO week in UTC: Monday 00:00 through Sunday 23:59:59.999, identified by its Monday date in `YYYY-MM-DD` form.
- The planner commits work to exactly one week at a time. The old cycle and milestone horizons were removed; `planning.cycle_weeks` and `planning.cycle_anchor` remain in the stored config for compatibility but no longer affect any surface.
- Weeks before the legacy anchor still floor into negative cycles in the retained calendar helpers, so historical plan items keep stable windows if a cycle view is reintroduced.

## Estimates

An issue's estimate is derived from its current size label through `planning.size_minutes`. It is never copied into the plan row, so changing the size or the map re-prices existing plans.

| Size | Default minutes | Default hours |
| :--- | ---: | ---: |
| `sm` | `120` | 2h |
| `md` | `240` | 4h |
| `lg` | `480` | 8h |

An issue without a size label is unestimated. Unestimated issues cannot be scheduled and contribute no committed minutes.

## Capacity

For one maintainer over one period:

```text
cap = floor(weekly_minutes × weeks × allocation_percent / 100)
```

- `weeks` is `1`; every visible capacity row is a single week.
- An issue's estimate is split evenly across its assignees that are active, configured maintainers. The integer remainder goes to the first such assignee.
- If no assignee matches, the issue's full estimate is in the **Unassigned** bucket, which has no cap.
- A maintainer's capacity is over when committed minutes exceed their cap. A maintainer with `weekly_minutes: 0` has zero usable capacity.
- Only plan mutations are blocked by the cap. A later GitHub edit can push a maintainer over; the capacity table displays it.

## Weekly plan presentation

`/plan` is a read-only projection of one Monday week. It is composed as a conventional Bootstrap document:

- a capacity table with one row per active maintainer: assignee, net capacity, planning capacity, scheduled and available;
- a scheduled-issues table with issue, title, assignee, size, hours and a remove action for writers;
- an unassigned section only when committed work has no active maintainer;
- an unestimated table with an **Estimate** action for open issues that have no size.

Scheduling, moving and clearing a commitment happen on the issue's **Properties** panel or through `PUT|DELETE /api/repos/{owner}/{repo}/issues/{number}/plan`. The weekly page does not introduce a second scheduling model.

## Actual time

Actual time is the union of intervals where the issue is **open** and its status is one of:

- `in-progress`
- `in-review`

Closing ends the interval at the issue's `closedAt` when known, otherwise at the close event. Reopening starts a new interval if the status is still active. `backlog`, `todo`, untriaged and closed periods are not actual time.

`IssueTime` has:

| Field | Meaning |
| :--- | :--- |
| `actualMinutes` | Union of open active intervals. |
| `estimateMinutes` | Minutes from the current size, or `null`. |
| `varianceMinutes` | `actual - estimate`, or `null`. |
| `leadMinutes` | Creation to close/now. |
| `cycleMinutes` | First active interval to close/now. |
| `delayMinutes` | Union of delay intervals. |
| `delayCount` | Number of delay rows before merging overlaps. |

Tracking starts at deployment (migration baseline) or when Funnel first observes a new issue. There is no historical backfill from the forge timeline.

## Delay records

A delay is a `state_issue_delay` row with `reason`, `started_at`, optional `ended_at`, `note` and `source`.

| Reason | Meaning |
| :--- | :--- |
| `dependency` | Another issue, release or team deliverable. |
| `info` | An answer or clarification. |
| `review` | Review, approval or sign-off. |
| `external` | A vendor, customer or third party. |
| `capacity` | No one is available. |
| `other` | Anything else. |

| Source | Created by | Editable |
| :--- | :--- | :--- |
| `blocked` | Adding the `blocked` label; reason comes from `funnel_metadata.blocked.reason`. | No. Remove the flag or close the issue. |
| `manual` | A writer from the Inspector or the delay API. | Yes: reason, note, `ended_at`; deletable. |

Removing the `blocked` flag closes open blocked delays only. Closing the issue closes every open delay. Reopening a still-blocked issue opens a new blocked delay. Total delay time is the union of all intervals, so overlaps count once.

## Epic metadata

An epic is an issue carrying the reserved `epic` label. The label group is `epic`, orthogonal to status, impact, urgency, size and the `blocked` flag.

The children live in the epic issue's trailing `funnel_metadata` envelope:

```yaml
epic:
  children: "owner/name#12,owner/name#3"
```

- `children` is one comma-separated scalar of `owner/name#number` references, kept in order.
- The body is the source of truth; there is no membership table.
- Malformed refs, zero numbers, duplicates and self references are dropped on read.
- Adding or removing a child rewrites only the `epic:` section and preserves every other section.
- Children may come from any configured repository.
- An issue is expected to belong to one epic; adding a child already listed by another epic is rejected with `409`.
- Nested epics are rejected with `400`.

## Tables

| Table | Key | Purpose |
| :--- | :--- | :--- |
| `state_plan_item` | `(org, name, issue_number)` | One issue scheduled into one Monday week. |
| `state_issue_event` | text `id`, index `(org, name, issue_number, at)` | Observed `status`, `state` and `blocked` transitions. |
| `state_issue_delay` | text `id`, index `(org, name, issue_number, started_at)` | Delay intervals with reason and source. |
| `mirror_thread.is_epic` | `(repo_id, number)` | Cached `epic` label for list queries. |

Plan items, events and delays are keyed by `owner/name` plus issue number rather than a mirror foreign key, so they survive mirror pruning and `clearMirror`.

## Endpoints

All endpoints require `write`.

| Method | Path | Body | Success |
| :--- | :--- | :--- | :--- |
| `PUT` | `/api/repos/{owner}/{repo}/issues/{number}/plan` | `{ "week_start": "YYYY-MM-DD" }` | `200 { item }` |
| `DELETE` | `/api/repos/{owner}/{repo}/issues/{number}/plan` | — | `200 { cleared: true }` |
| `PUT` | `/api/repos/{owner}/{repo}/issues/{number}/epic` | `{ "is_epic": true\|false }` | `200` |
| `PUT` | `/api/repos/{owner}/{repo}/issues/{number}/epic/children` | `{ "children": ["owner/name#n", …] }` | `200` |
| `POST` | `/api/repos/{owner}/{repo}/issues/{number}/delays` | `{ "reason", "started_at"?, "ended_at"?, "note"? }` | `201` |
| `PATCH` | `/api/repos/{owner}/{repo}/issues/{number}/delays/{id}` | `{ "ended_at"?, "note"?, "reason"? }` | `200` |
| `DELETE` | `/api/repos/{owner}/{repo}/issues/{number}/delays/{id}` | — | `204` |

The plan endpoint returns `400` for an invalid week or an unestimated/unowned issue, `404` for an unmirrored issue, and `409` for a cap breach. The epic and delay endpoints follow the same conventions; see the [HTTP API](./http-api.md) for the full status tables.

## Related

- [Settings](./settings.md) — the complete `state_setting` registry.
- [Database schema](./database-schema.md) — every table and column.
- [Reserved labels](./reserved-labels.md) — the `epic` label and the rest of the vocabulary.
- [HTTP API](./http-api.md) — request and response contracts.
- [Routes and pages](./routes-and-pages.md) — `/plan`, `/epics` and the settings pages.
- [Glossary](./glossary.md) — actual time, delay, epic.
