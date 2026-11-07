# Sync and mirror

Funnel's mirror is a rebuildable SQLite copy of GitHub issues, kept current by conditional polling, batched hydration and a nightly reconciliation sweep. Polling is the only sync path: GitHub never needs an inbound connection to the server.

## The mirror is disposable

Everything under `mirror_*` is a cache. Repositories, users, issues, labels, assignees and comments can all be recreated from GitHub. The sync worker upserts hydrated records, the conflict resolver rewrites label assignments, and reconciliation removes rows that no longer exist upstream. No user-authored content depends on those rows.

Durable state lives elsewhere and is keyed by `owner/name` plus issue number, not by a foreign key to `mirror_thread`. Work notes and attachment metadata survive mirror pruning and a full re-sync; attachment bytes live under the upload directory. That separation is what makes aggressive pruning safe. It also means a repaired or partially rebuilt mirror does not take anyone's internal notes with it.

The cursor is derived rather than stored, which gives the mirror a useful self-healing property: drop the `mirror_*` tables and the next poll sees no newest `updated_at`, falls back to an unconditional listing, and repopulates. There is no separate cursor row to drift out of sync with the data it describes.

## ETag polling and a derived cursor

Each repo row stores the ETag of its last successful issue listing. A poll sends:

```text
GET /repos/{owner}/{repo}/issues
    ?state=all&sort=updated&direction=asc&per_page=100
    &since=<newest mirrored updated_at, if any>
If-None-Match: <stored ETag>
```

GitHub answers `304 Not Modified` while nothing has changed. Octokit surfaces that as a thrown error with status 304, which the worker treats as a successful no-op: it records `last_polled_at`, clears the degraded flag and returns. Conditional requests that return 304 do not consume the REST rate limit, so a quiet repository is cheap even at the active cadence.

The cursor is `max(updated_at)` across the repo's mirrored issues. It is not persisted separately. That has three consequences worth understanding:

- On a fresh repo the cursor is `null`, so the request has no `since` and the first sync is a backfill.
- GitHub's `since` is inclusive. Re-sending the boundary issue is harmless because hydration is an idempotent upsert.
- The request URL is stable while nothing changes, which is why the ETag keeps producing 304s. After a change is hydrated the newest `updated_at` advances, the URL changes, and the next poll is one 200 before quiet 304s resume.

Only the first page is sent with `If-None-Match`. When pagination is needed the later pages are fetched unconditionally; if one unexpectedly answers 304 the worker simply stops paginating.

## Pagination, pull requests and the history window

The listing is sorted oldest-updated first and paginated until a short raw page is returned. Pagination counts raw items, including pull requests, because GitHub's `per_page` does too. A page of 100 that is entirely pull requests still means "ask for the next page".

Pull requests never enter the mirror. The REST poll skips any item carrying a `pull_request` field, and GraphQL hydration requests only the `... on Issue` inline fragment, so a PR node comes back without issue fields and is dropped by `normalizeNode`. This keeps "issues" in the cockpit actually meaning issues, and it avoids duplicating GitHub's review workflow in a tool that does not model it.

The history window bounds both storage and sync cost. Open issues are always in scope. A closed issue is in scope only while `closed_at` is within `sync.history_days` (90 days by default). A changed issue returned outside that window is deleted from the mirror during the same poll, so age-out is immediate where it intersects change detection; rows that simply stop being returned are caught by the next nightly full sweep.

This creates a deliberate limit: Funnel is not a complete historical archive. Closed issues older than the window are not searchable locally. The alternative — mirroring every issue ever opened — would make first sync and nightly reconciliation much more expensive for large repositories, and the cockpit's working set is current work plus recent history.

## Hydration in batches of 100

REST polling is cheap change detection; GraphQL is the fetch. The worker collects the `node_id` of each in-window issue and hydrates them in `nodes(ids:)` batches of 100, GitHub's per-query ceiling. One query returns title, body, state and state reason, timestamps, author, milestone, labels, assignees and the first 100 comments. A batch therefore replaces many individual issue requests.

Hydration writes users first because they are foreign-key targets, then upserts the issue and replaces its label and assignee junction rows inside a transaction. The cached status, impact, urgency, derived priority, size, blocked flag and label-conflict marker are computed from the reserved labels at the same time. Priority itself is never a mirrored label. Replacing rather than merging the junction rows is what makes label removal on GitHub propagate correctly.

Two bounds are intentional. Only the first 100 comments, labels and assignees are requested per issue. A very long comment thread is not fully mirrored; the cockpit is a working view, not an archival export. And a batch can return fewer records than ids because PR nodes and nodes missing identity are discarded. Neither case is treated as an error.

## Issue relationships in two fail-soft queries

Parent/sub-issue and blocked-by/blocking links are mirrored after the issue itself, in two separate GraphQL queries over the same `nodes(ids:)` batches. They deliberately do **not** widen the main hydration query: on a GitHub Enterprise host that predates sub-issues or dependencies, one rejected field would otherwise fail every issue upsert.

- The sub-issues query asks for `parent` plus `subIssues(first: 100)`.
- The dependencies query asks for `blockedBy(first: 100)` and `blocking(first: 100)`.

Each query is isolated. When a query succeeds, the source issue's rows for its kinds are replaced; when it fails, the failure is logged and the previously stored rows for those kinds are left untouched. The other relation set and the issue upsert are unaffected. A host that rejects only dependencies therefore keeps parent/child progress, and a host that rejects both keeps the issue mirror and any older relationship rows. Polling continues normally either way.

Edges are stored in `mirror_issue_relation` with a target `owner/name` and number, because GitHub may report a child or dependency in another repository. `OPEN`/`CLOSED` is normalised to lower case, refs without a number are dropped, and duplicates are collapsed and sorted by repo then number. Each connection is capped at 100 edges per issue, the size of one page. Sub-issue progress is computed from the mirrored child edges rather than `subIssuesSummary`, so the Inspector cannot show a percentage that disagrees with the list beneath it. These relationships are read-only in Funnel and are distinct from the manual `blocked` flag, which remains authoritative for Attention.

## Issue types in a separate fail-soft query

GitHub issue types (Bug/Feature/Task, where the account and repository offer them) are mirrored into `mirror_thread.issue_type`. Like relationships, they are fetched after the issue upsert in their own `nodes(ids:)` query, in batches of 100, rather than widening the main hydration query. A GitHub Enterprise host or repository that does not support issue types rejects only this query: the failure is logged, every previously stored type is left untouched, and issue hydration continues normally. Polling and post-write refreshes use the same hydration path, so they pick the feature up automatically when it becomes available.

The mirrored value is the type's trimmed `name`; a `null`/absent `issueType` stores SQL `NULL`, and a malformed name is skipped so it cannot overwrite a good value. When the type query succeeds, each returned issue is updated by number and the mirror revision advances only when a value actually changed. The main issue upsert never writes this column, which is why an unsupported host cannot clear a type or break sync. Creation follows the same rule: GitHub's REST create path ignores the type field, so Funnel sets it in a follow-up write and keeps the successful issue when that write is unsupported or rejected.

## Reserved-label conflicts

Funnel's workflow vocabulary allows at most one label per active group: status, impact, urgency and size. A `flags` group carries orthogonal markers such as `blocked`. Retired priority labels are ignored; their conflicts are handled by the conflict flag, not timeline resolution. When GitHub ends up with two labels from the same group — because someone edited labels outside Funnel, or two clients raced — the sync worker resolves it with the App installation token.

The decision rule is **latest added label wins**, read from the issue timeline's `labeled` events. The timeline is paginated and reduced to label names and timestamps. If the timeline has no `labeled` events for the contenders, or two candidates share the newest timestamp, the result is ambiguous.

Ambiguity is not guessed at. `resolveIssueConflict` leaves the labels untouched, stores the deterministic projection for display, and sets `mirror_thread.label_conflict`. The UI can then warn that GitHub holds conflicting reserved labels. When the timeline is decisive, every obsolete label is deleted through the installation token and the metadata is recomputed from the survivors.

The deterministic projection matters: `deriveMetadata` must return something even when the label set is contradictory. It picks the first label in canonical order, but also reports the conflicting groups so callers know not to treat that choice as a resolution. Writes made through Funnel are group-aware (`withReserved` swaps the sibling rather than adding to it), so conflicts should be rare; the resolver exists for the cases where GitHub was edited elsewhere.

## Pruning, deletion and transfer

There are two pruning paths, and they catch different failures.

**Incremental pruning** happens on every poll. Any changed issue returned by `since` that is now outside the history window is deleted. This handles age-out without waiting for a full sweep.

**Reconciliation pruning** happens nightly. A full listing has no `since` and no ETag, so it returns every issue GitHub will page through. The worker records the numbers it saw inside the history window and calls `deleteIssuesNotIn`. Anything mirrored for that repo but absent from the full listing is deleted. That is how Funnel notices an issue deleted on GitHub or transferred to another repository, neither of which appears as an update on the old repo's incremental feed.

`deleteIssue` removes labels, assignees and comments explicitly before the issue row, because the junction tables deliberately carry no foreign key to the disposable issue table. The schema comments call this out; relying on cascade would silently leave orphaned children.

## Nightly reconciliation at 03:00

`scheduleReconciliation` arms a timer for the next local 03:00 (`RECONCILE_HOUR = 3`) and re-arms after each run. For every configured repo it:

- performs a full, unconditional poll and hydration;
- prunes rows absent from the full listing;
- re-runs canonical label provisioning;
- records `last_reconciled_at` and clears the degraded flag.

The sweep is intentionally expensive and intentionally rare. It is the backstop for anything incremental polling can miss: a deletion, a transfer, a lost event, a resolver that failed, a long outage. It is also the point at which label drift is repaired even if no issue changed.

Two operational details follow. The hour is local time, so `TZ` should be set explicitly on a server whose local timezone is ambiguous. And the timer is in-process: if the process is down at 03:00, the sweep does not run late; the next timer is armed for the following 03:00. Incremental polling and the next startup's label provisioning cover most of the gap, but a deletion may remain mirrored for up to a day.

## Cadence: active, idle and degraded

The scheduler wakes every five seconds and asks which repos are due. The interval is chosen per tick from the number of open SSE clients:

| Condition | Interval | Default |
| :--- | :--- | :--- |
| At least one `/api/events` stream is open | `sync.poll_interval_active_seconds` | 30 s |
| No streams | `sync.poll_interval_idle_seconds` | 300 s |

`clientCount()` is the number of listeners on the in-process bus, which is effectively the number of open cockpit tabs. One open tab keeps the whole instance in active mode. Closing the last tab lets the next tick fall back to the idle interval, so a cockpit nobody is watching does not keep polling every 30 seconds.

New repositories are staggered across the interval on their first tick (`intervalMs / repos.length * index`) so adding several repos does not produce a burst. Each successful cycle schedules that repo's next due time. A settings change calls `notifyConfigChanged`, which clears the schedule so added or removed repos and retuned intervals take effect on the next tick.

A failed repo cycle is isolated: the scheduler continues with the remaining repos. Once the repo row has been resolved, a failure in label refresh, assignee refresh, milestone refresh or the poll itself persists `degraded = 1` on the repo row, logs a warning and rethrows to the scheduler. A successful poll or a successful nightly reconciliation clears it. The flag makes the failure durable and inspectable rather than merely a log line, and it avoids a tight retry loop: the repo stays on its normal schedule.

## Post-write single-issue refresh

Writes do not wait for the next poll. After a successful mutation the API route calls `scheduleRefresh`, which invokes `refreshIssue` fire-and-forget. That function resolves the installation, fetches the single issue with `GET /repos/{owner}/{repo}/issues/{number}`, skips PRs, hydrates its `node_id`, resolves any label conflict, and publishes an `issues` event. A successful milestone create schedules a repository milestone refresh instead, so the Inspector picker lists the new milestone without waiting for the next poll.

The mutation itself has already published an event and returned to the browser. The immediate refresh is a freshness optimisation, not part of the write's transaction. If it fails — rate limit, transient network error, process shutdown — the write is still correct on GitHub and the next poll or nightly sweep repairs the mirror. This is the right ordering: GitHub confirmation is the success criterion, and local state is allowed to lag briefly.

## The trade-offs

### Eventual consistency

The cockpit can be stale by up to one polling interval, or longer after a failure. The design accepts this because the work is issue triage, not trading. It mitigates the gap with SSE notifications, post-write refreshes and the nightly sweep, but it does not eliminate it. A user who edits an issue directly on GitHub may not see it in Funnel for 30 seconds while a tab is open, or five minutes while idle.

### Rate limits

Conditional 304s are cheap, but polling is not free. Every cycle also refreshes the repo's labels, assignable users and milestone set, and conflict resolution fetches issue timelines. Hydration uses GraphQL batches of 100, which is efficient per issue but still consumes quota. Active mode multiplies all of this by ten compared with idle mode, and the nightly full sweep is the single largest request burst. Label provisioning makes additional writes for missing or changed canonical labels; a converged repository needs none.

Shortening the intervals is therefore a real cost decision, not a harmless responsiveness tweak. The defaults assume a small team with a tab open during working hours and no interest in polling overnight at the same rate.

### Single writer

SQLite runs in WAL mode with a five-second busy timeout, which gives good concurrent read/write behaviour for one process. It does not make the database a multi-writer service. All mirror writes are serialised through the single sync worker and the request process, and a second Funnel process against the same file would duplicate polling, duplicate label writes and produce confusing last-writer-wins results. The single-writer constraint is the reason the deployment model forbids replicas, not an implementation detail that can be tuned away.

The overall posture is convergence over immediacy: GitHub is authoritative, the mirror is allowed to be briefly wrong, and every failure has a cheap path back to correctness.

## Related

- [Architecture](./architecture.md) — where the worker, database and SSE bus sit in the process.
- [Deployment model](./deployment-model.md) — why the single writer implies a single instance.
- [Funnel configuration reference](../reference/environment-variables.md) — deploy-time variables.
- [Configure sync](../how-to/configure/sync.md) — the history window and polling cadence settings.
- [Design principles](./design-principles.md) — how freshness and density shape the cockpit's behaviour.
