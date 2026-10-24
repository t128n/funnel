# Actual time, structured delays and epics — spec

## 1. Observed events and actual time

Funnel records observed workflow transitions in a durable `state_issue_event` log keyed by `(org, name, issue_number)`. There are three kinds: `status`, `state` and `blocked`. Every issue gets baseline rows on first observation (or at migration for issues already mirrored) so tracking starts from that moment; there is no historical backfill from the forge timeline.

On each sync, the previous mirror snapshot is compared with the hydrated issue. A changed status, open/closed state or blocked flag appends one event with `from_value`, `to_value`, `at` and `source = "sync"`. A first sighting appends baseline events with `from_value = null`.

Actual time is the union of intervals where the issue is open and its status is `in-progress` or `in-review`. Closing the issue ends the active interval at `closedAt` when known, otherwise at the close event. Reopening starts a new interval if the status is active. The issue detail exposes `actualMinutes`, `estimateMinutes`, `varianceMinutes`, `leadMinutes` (opened→closed/now), `cycleMinutes` (first active→closed/now) and `delayMinutes`.

## 2. Delay records

Delays are durable `state_issue_delay` rows with `reason`, `started_at`, optional `ended_at`, `note`, and `source = "blocked" | "manual"`. Reasons are `dependency`, `info`, `review`, `external`, `capacity` and `other`.

Automatic delays follow the `blocked` flag: adding it opens a delay with the reason from the issue's `funnel_metadata` block; removing it closes the open blocked delay. Closing the issue closes every open delay. Reopening a still-blocked issue opens a new blocked delay. Existing blocked issues get a delay row at migration with reason `other`.

Manual delays are created, edited and closed from the Inspector. They are local-only. A manual delay may overlap a blocked delay; total delay time is the union of intervals, so overlaps are counted once.

The block dialog gains a required structured reason. `BlockInfo` carries it, `writeBlocked` serialises it in the `blocked:` section, and older blocks without one read as `other`.

## 3. Epic label and metadata

`epic` is a fifteenth canonical reserved label in its own `epic` group, provisioned in every configured repository. `deriveMetadata` caches `isEpic` on `mirror_thread.is_epic`, and issue DTOs expose it. The label is orthogonal to status, size and the `blocked` flag.

An epic is an issue carrying the `epic` label. Its children are recorded in that issue's trailing `<!-- funnel_metadata -->` envelope:

```yaml
epic:
  children: "orgA/core#12,orgA/web#3"
```

The children list is the source of truth. `readEpicChildren(body)` parses the comma-separated refs, drops malformed or self references, and returns them in order. `writeEpicChildren(body, children)` rewrites only the `epic:` section and preserves every other section. Adding or removing a child edits the epic issue body through the signed-in user's token, so the relation is portable and survives a mirror rebuild.

Children may come from any configured repository. An issue should belong to one epic: the add operation rejects a child already listed by another epic. Nested epics are rejected.

## 4. Epic queries and rollups

`listEpics()` returns every mirrored issue with `is_epic = 1`, open before closed, with its child count, closed-child count, progress, estimate sum, actual sum, delay sum and milestone/due date. `getEpicDetail(ref)` returns the epic issue, its ordered children (status, assignees, estimate, actual, delay) and the same rollups.

Children are resolved by parsing the epic body on read; there is no separate membership table. Missing or pruned children are skipped from rollups and shown as unavailable. Rollups use the same estimate mapping and actual/delay calculators as the Inspector.

## 5. Inspector surfaces

The Inspector gains a time block (estimate, actual, delay, variance), a delay list with reason, interval, duration and note, and a "Record delay" action for writers. Manual delays can be closed or deleted; automatic blocked delays are read-only.

The block dialog and blocked card show the structured reason. The Inspector also shows epic membership: an `Epic` badge and link when the issue is an epic, the parent epic link when it is a child, and a writer-only "Mark as epic"/"Remove epic" toggle. Child membership is added from the epic page, not the child.

## 6. Epics views

`/epics` lists open epics first, then closed, with progress and rollups. `/epics/{owner}/{repo}/{number}` shows the epic issue, rollup cards and the child table. Writers can add a child from a searchable list of open issues not already in another epic, and remove a child. The workspace sidebar gains an `Epics` item.

## 7. APIs and access

All endpoints require `write`; reads are server loads behind the normal `read` session.

- `PUT /api/repos/{owner}/{repo}/issues/{number}/epic` with `{ "is_epic": true|false }` adds or removes the label.
- `PUT /api/repos/{owner}/{repo}/issues/{number}/epic/children` with `{ "children": ["owner/name#n", ...] }` replaces the list by editing the epic body.
- `POST /api/repos/{owner}/{repo}/issues/{number}/delays` with `{ "reason", "started_at"?, "ended_at"?, "note"? }`.
- `PATCH /api/repos/{owner}/{repo}/issues/{number}/delays/{id}` with `{ "ended_at"?, "note"?, "reason"? }`.
- `DELETE /api/repos/{owner}/{repo}/issues/{number}/delays/{id}`.

Successful writes publish an `issues` event for the affected issue so open Inspectors refetch.

## 8. Persistence and migration

`state_issue_event`, `state_issue_delay` and the `mirror_thread.is_epic` column are additive. The migration seeds baseline events for every mirrored issue and a blocked delay for every currently blocked issue. Events and delays are durable and never pruned with the mirror. No new settings, environment variables or external services.

## 9. Documentation

Update the reserved-label count and group, the workflow model, the database schema, routes/pages, HTTP API and glossary. Add how-to guides for recording delays and managing epics, including the fact that actual time starts at deployment (no backfill) and that epic children live in the epic body's `funnel_metadata`.
