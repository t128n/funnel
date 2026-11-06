# Sync and mirror

The mirror is a rebuildable SQLite copy of GitHub issues. Conditional polling and batched hydration keep it current; reconciliation repairs what polling misses.

## Disposable mirror, durable state

Everything under `mirror_*` is a cache. Repositories, users, issues, labels, assignees, milestones, comments, relations, linked pull requests, and timeline items can all be recreated from GitHub.

Durable records are keyed by `owner/name` plus issue number rather than a foreign key to `mirror_thread`: work notes, attachments, plan items, delays, waiting state, snoozes, notifications, and issue watches all survive mirror pruning and a full re-sync. [[src/lib/server/sync/mirror.ts]] owns the mirror writes; [[src/lib/server/db/schema.ts]] states the table contract.

The polling cursor is derived, not stored. [[src/lib/server/sync/mirror.ts#getRepoCursor]] returns the newest mirrored `updated_at`; a missing cursor means a full backfill, and a lost mirror self-heals on the next poll.

## Conditional polling

Each repository is polled with `since=<newest mirrored updated_at>` and its stored ETag.

The history window bounds storage. [[src/lib/server/sync/worker.ts#inHistoryWindow]] keeps every open issue and only closed issues whose `closed_at` is within `sync.history_days` (90 by default). A changed issue outside the window is deleted during the same poll.

Pull requests never become issue rows. The listing skips items carrying a pull-request marker, and GraphQL hydration requests only the `... on Issue` fragment, so a PR node is dropped by [[src/lib/server/sync/hydrate.ts#normalizeNode]].

## Batched hydration

[[src/lib/server/sync/hydrate.ts#hydrateAndStore]] collects GitHub node ids and fetches them in `nodes(ids:)` batches of [[src/lib/server/sync/hydrate.ts#BATCH_SIZE]] (100). One query returns title, body, state, timestamps, author, milestone, labels, assignees, the first 100 comments, and the latest 50 timeline items.

Long comment threads are completed with a paginated follow-up (up to [[src/lib/server/sync/hydrate.ts#MAX_COMMENT_PAGES]] pages) rather than silently truncated. Labels and assignees remain capped at 100 per issue, which is one connection page.

Hydration writes users first, then upserts the issue and replaces its label and assignee junction rows in a transaction. Replacing rather than merging is what makes a label removal on GitHub propagate correctly.

Two side effects run during hydration: [[src/lib/server/sync/hydrate.ts#snapshotIssue]] captures the pre-change state for notifications, and [[src/lib/server/actuals/transitions.ts#recordIssueTransitions]] appends the observed workflow events used for actual time.

## Fail-soft enrichment

Issue types and GitHub-native relations are fetched after the issue upsert, each in its own query, so a host that predates a feature cannot break the main mirror.

- [[src/lib/server/sync/relations.ts#syncIssueRelations]] fetches parent/sub-issue and blocked-by/blocking edges. A rejected query leaves the previously stored edges untouched.
- [[src/lib/server/sync/issue-types.ts#syncIssueTypes]] fetches issue type names (Bug, Feature, Task). An unsupported host or repository rejects only this query.
- [[src/lib/server/sync/pull-requests.ts#syncPullRequestsForIssues]] discovers pull requests that close or are linked to an issue, mirrors their review and check state, and optionally applies the `sync.pr_in_review` / `sync.pr_done` transitions.

All three are deliberately outside the main hydration query. Progress is computed from mirrored child edges rather than a summary field, so the Inspector cannot disagree with the list under it.

## Reserved-label conflicts

A label group may hold at most one label. When GitHub ends up with several, [[src/lib/server/sync/conflicts.ts#deriveMetadata]] still produces a deterministic projection for display, and [[src/lib/server/sync/conflicts.ts#resolveIssueConflict]] repairs the issue.

The repair rule is latest added label wins, read from the timeline's `labeled` events. If the timeline has no decision or the newest timestamp ties, the resolver leaves every label unchanged and sets `mirror_thread.label_conflict`; ambiguity is flagged, not guessed. Writes through Funnel are group-aware, so conflicts normally arise only from edits made elsewhere.

## Reconciliation

[[src/lib/server/sync/reconcile.ts#reconcileRepo]] performs the expensive sweep once a day at [[src/lib/server/sync/reconcile.ts#RECONCILE_HOUR]] local time:

- a full, unconditional poll with no cursor;
- refreshed label, assignee, and milestone directories;
- [[src/lib/server/sync/mirror.ts#deleteIssuesNotIn]] to prune issues deleted or transferred upstream;
- canonical-label provisioning to restore drifted or deleted labels;
- `last_reconciled_at` and a cleared degraded flag.

The nightly sweep is the backstop for deletions, transfers, missed events, and long outages. Incremental polling and the next startup's provisioning cover most of the gap without waiting for it.

## Cadence

The scheduler wakes every five seconds. The per-repo interval is chosen from the number of open SSE clients: 30 seconds while at least one cockpit tab is connected, 300 seconds when idle (both configurable).

New repositories are staggered across the interval so adding several does not produce a burst. A failed repository cycle is isolated: the scheduler continues, the repository is marked degraded, and the next successful poll or reconciliation clears it.

[[src/lib/server/sync/worker.ts#notifyConfigChanged]] clears the schedule after a settings save so added or removed repositories and retuned intervals take effect on the next tick.

## Realtime events

The in-process bus in [[src/lib/server/sync/events.ts]] is a `Set` of listeners with no external broker. [[src/lib/server/sync/events.ts#publish]] advances the mirror revision before delivery and isolates a throwing listener.

Event names are `sync`, `issues`, `intake`, `settings`, `notifications`, and `planning`. The browser opens one shared `EventSource` for the whole tab through [[src/lib/client/events.ts#connectEvents]].

[[src/lib/server/sync/events.ts#clientCount]] is both the number of open streams and the signal that switches polling between active and idle cadence. [[src/lib/server/sync/events.ts#HEARTBEAT_MS]] keeps intermediaries from dropping an idle stream.

## Tests

Conditional polling, hydration limits, conflict resolution, pruning, and reconciliation are covered by [[src/lib/server/sync/worker.test.ts]], [[src/lib/server/sync/hydrate.test.ts]], [[src/lib/server/sync/conflicts.test.ts]], [[src/lib/server/sync/mirror.test.ts]], and [[src/lib/server/sync/reconcile.test.ts]].

## Related

The architecture, workflow, and operations docs set the constraints this sync loop works within.

- [[architecture]] — where the worker, database, and bus sit in the process.
- [[workflow]] — how mirrored labels become the cockpit's workflow state.
- [[operations]] — why the single-writer model forbids replicas.
