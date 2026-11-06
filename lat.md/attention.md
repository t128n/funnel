# Attention

Attention is the cockpit's exception queue: blocked work, work waiting on someone else, and configurable rule breaches. It is deliberately separate from the board and the issue feeds.

## Blocked work

Attention lists open issues whose mirrored `blocked` flag is set, grouped by re-check date.

The re-check date is a `YYYY-MM-DD` value in the issue body's `funnel_metadata`. The client groups items into overdue, today, upcoming (the next seven days), and unscheduled using the browser's local timezone. The date is parsed on read rather than cached in a column because blocked issues are few and the body is already mirrored.

## Waiting differs from blocked

A waiting issue is parked until the reporter, a vendor, or an upstream project responds. No Funnel work is possible, whereas a blocked issue is work in flight that is held up.

Waiting state lives in `state_issue_waiting`, keyed by `owner/name` plus issue number so it survives mirror pruning. It is never written to GitHub: no body edit, no label, no comment. [[src/lib/server/waiting.ts#setWaiting]] stores a reason, an optional note, an optional re-check date, and the time the wait began; [[src/lib/server/waiting.ts#clearWaiting]] removes it. Revising the reason preserves `waiting_since`.

The reasons are `needs-info`, `waiting-on-reporter`, `waiting-on-vendor`, `waiting-on-upstream`, and `other`, defined in [[src/lib/waiting.ts]]. A wait is stale after seven calendar days by default; the Attention page also accepts the configured `attention.waiting_days`.

## Snooze

A snooze hides a staged submission or an untriaged issue from the Inbox until a chosen time. It is local-only and never touches GitHub or the mirror.

[[src/lib/server/snooze.ts#snoozeSubmission]] and [[src/lib/server/snooze.ts#snoozeIssue]] upsert a row keyed by the stable item identity. Active snoozes are excluded from the pending queue and its badge, but the issue remains visible in **Issues**, the board, and the matrix. `?snoozed=1` on `/inbox` shows the deferred items.

The maximum horizon is one year. Clearing a snooze resurfaces the item immediately; triaging or accepting it also clears the snooze.

## Rule breaches

Four rules share one vocabulary and one breach shape, evaluated by [[src/lib/server/attention/rules.ts#evaluateAttentionRules]]:

- **First response** — an issue has no comment from anyone other than its author.
- **Stale open** — an open issue has not been updated for the configured number of days.
- **Waiting** — a local waiting row has exceeded its threshold.
- **Re-check** — a blocked issue's body re-check date is further past than the threshold.

Each rule's threshold is a non-negative integer in days; `0` disables it. First response and stale open breach at the boundary (`age >= days`), while waiting and re-check breach only once strictly past it, matching their existing UI meanings.

Clock semantics are deliberately split. First response and stale open use elapsed instants; waiting uses local calendar days; re-check compares against the server's UTC date. Results are deterministic: rule order, then most overdue, then repository and issue number.

[[src/lib/server/attention/queries.ts#attentionBreaches]] gathers the inputs and evaluates the rules. The sync worker calls the same path on a slow cadence and creates at most one `sla` notification pass every five minutes.

## Notifications

Notifications are per-user rows in `state_notification`. Each row snapshots the title, body, actor, and URL so rendering never depends on the disposable mirror. Reads are always scoped by `auth_user.id`.

[[src/lib/server/notifications/plan.ts#planIssueNotifications]] compares two snapshots of the same issue and produces drafts for assignment, mention, comment, status, priority, and open/closed changes. The first sight of an issue is silent: only a change from an already-known snapshot notifies. New assignees are notified even without watching; watchers receive comment and change notices; a mention wins over the plain watched-comment notice.

[[src/lib/server/notifications/service.ts#createNotifications]] inserts drafts with `onConflictDoNothing` on a unique `dedupe_key`, so a re-poll or post-write refresh cannot repeat a notification. [[src/lib/server/notifications/service.ts#watchIssue]] and `unwatchIssue` manage explicit watches.

Delivery is a payload-free `notifications` SSE signal; each browser refetches its own feed. Rows are retained until read, and the sidebar badge counts only unread rows. New-intake notices go to admins and respect both the master switch and `notifications.new_intake`.

## Insights

The `/insights` view is a read-only analytics snapshot over the same mirror and triage history. It separates two clocks:

- **snapshot** metrics describe the database now: inbox age, WIP, stale waiting, and backlog aging;
- **range** metrics include events in a UTC calendar range: time to first triage, time to close, and throughput.

[[src/lib/server/insights/metrics.ts]] defines the arithmetic; [[src/lib/server/insights/load.ts#loadInsights]] gathers the rows. The default range is the last 30 calendar days. Invalid or reversed dates fall back to that range and are reported rather than failing the page. There is no business-day or working-hours arithmetic; the stale-waiting snapshot reuses the same local-calendar helper as Attention so the two surfaces agree.

## Tests

Rule evaluation and notification planning are covered by [[src/lib/server/attention/rules.test.ts]] and [[src/lib/server/notifications/plan.test.ts]]; waiting, snooze, notification routes, and the Attention page by [[tests/waiting-routes.test.ts]], [[tests/snooze-routes.test.ts]], [[tests/notifications-routes.test.ts]], and [[tests/attention-rules-page.test.ts]].

## Related

The workflow, planning, and UI docs describe the data and surfaces Attention reads.

- [[workflow]] — the status, priority, and blocked labels Attention consumes.
- [[planning]] — delays and actual time, which share the issue body metadata.
- [[ui]] — how breaches and notifications are rendered and refreshed.
