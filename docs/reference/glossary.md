# Glossary

Definitions of the terms used across Funnel's reference documentation.

## Terms

**Funnel** — A self-hosted GitHub issue cockpit. It mirrors configured repositories into a local SQLite cache, provides inbox triage, issue feeds, a status board, an attention view and an issue Inspector, and exposes a public intake endpoint. It runs as a single long-lived Bun process. See the [project README](../../README.md).

**Mirror** — Funnel's disposable local copy of GitHub repositories, issues, labels, comments and users, stored in the `mirror_*` tables. The mirror is rebuilt by sync, can be pruned by the history window or reconciliation, and is never the source of truth. See [Database schema](./database-schema.md#mirror-tables).

**Hydration** — Fetching the full issue payload for changed issue node ids in batched GraphQL queries (up to 100 ids per query) and writing the result into the mirror. Hydration supplies bodies, labels, assignees and the first page of comments that the REST change-detection poll does not carry. See [`hydrate.ts`](../../src/lib/server/sync/hydrate.ts).

**Cursor** — The newest mirrored `updated_at` for a repository, used as GitHub's inclusive `since` value during conditional polling. It is derived from the mirror rather than stored as a separate column; re-sending the boundary issue is an idempotent upsert. See [`worker.ts`](../../src/lib/server/sync/worker.ts).

**Reconciliation** — The nightly full sweep that re-hydrates every open issue and every issue closed inside the history window, prunes mirror rows that were deleted, transferred or aged out, and re-provisions canonical labels. It is scheduled for 03:00 local time. See [`reconcile.ts`](../../src/lib/server/sync/reconcile.ts).

**Reserved label** — One of Funnel's fifteen canonical labels: status `backlog`, `todo`, `in-progress`, `in-review`; impact `sev`, `mod`, `min`; urgency `high`, `mid`, `low`; size `sm`, `md`, `lg`; the orthogonal flag `blocked`; and the orthogonal membership marker `epic`. At most one label per active group is authoritative; a conflicting set is resolved by the latest `labeled` timeline event, or flagged as a label conflict. Absence means untriaged, unassessed, unestimated, not blocked or not an epic. Priority is derived, not a label. See [`labels.ts`](../../src/lib/labels.ts).

**Impact** — The first of two triage inputs, a reserved label: `sev` (Severe), `mod` (Moderate) or `min` (Minor). The mirror caches it as `1`–`3`. See [Impact, urgency, and priority](./priority.md).

**Urgency** — The second triage input, a reserved label: `high`, `mid` or `low`. The mirror caches it as `1`–`3`. See [Impact, urgency, and priority](./priority.md).

**Priority** — The P1–P3 (High/Medium/Low) result of looking up impact × urgency in the published matrix. One unset axis yields P3; both unset mean no priority. Priority is never a GitHub label; the retired `p1`–`p3` labels are only compared for the conflict flag. See [Impact, urgency, and priority](./priority.md).

**Shortcode** — A short uppercase project key for a repository, at most six characters, used in compact issue references such as `FIT-12`. A configured `repos[].shortcode` wins; otherwise it is derived from the repository name (for example `funnel-issue-tracker` → `FIT`). Shortcodes are unique across configured repositories (enforced by config validation). See [`issue-ref.ts`](../../src/lib/issue-ref.ts).

**Milestone** — A GitHub milestone, mirrored per repository in `mirror_milestone`. GitHub scopes a milestone to exactly one repository, so Funnel never merges equal titles across repositories; an issue references its milestone by number. The cockpit offers a read-only Milestones view, a milestone filter and group-by dimension, and a set-or-clear picker that can lazily create a milestone in the issue's repository. See [Use milestones](../how-to/use/milestones.md).

**Estimate** — The minutes a size label implies for planning. `planning.size_minutes` maps `sm`, `md` and `lg` to fixed integer minutes (default 2h, 4h and 8h) instance-wide. The value is derived from the issue's current size label on every read and never copied into a plan item, so changing either re-prices the plan. An issue without a size label is **unestimated** and cannot be scheduled. See [Configure estimates and weekly plans](../how-to/configure/planning.md).

**Net hours** — A maintainer's contracted weekly hours minus recurring meetings, on-call and other fixed commitments. Funnel stores net hours as `weekly_minutes` in `planning.maintainers` and plans at most 60% of them by default; the rest is buffer for reviews, unplanned work and slack. The value is never called "gross hours". See [Configure estimates and weekly plans](../how-to/configure/planning.md).

**Cycle** — Legacy stored configuration: a fixed number (`planning.cycle_weeks`, default 2) of contiguous Monday weeks counted from `planning.cycle_anchor` (default Monday `2024-01-01`). The planner no longer exposes a cycle surface; the helpers are retained so historical plan items keep stable windows. Weeks before the anchor floor into negative cycles. See [`calendar.ts`](../../src/lib/server/planning/calendar.ts).

**Plan item** — A durable row in `state_plan_item` that commits one open, sized issue to one Monday week, keyed by `(org, name, issue_number)` with no foreign key to the mirror. Plan items are never written to GitHub and survive mirror pruning and `clearMirror`; a plan item whose issue is closed or no longer mirrored frees its capacity. The commitment is edited on the issue; `/plan` projects the resulting capacity. See [Database schema](./database-schema.md#state_plan_item).

**ALPEN** — The five-part day-planning model on the personal `/day` page: **A**ufgaben (candidates from the Monday week, ordered P1 → P3), **L**änge (each block's minutes from the size estimate), **P**uffer (a configurable share of the work window emitted as explicit buffer blocks), **E**ntscheiden (ordering plus manual add, remove and start-time edits) and **N**achkontrolle (planned-versus-actual review). The day view is a timed projection of the week plan, not a second backlog. See [Plan your day](../how-to/plan/plan-your-day.md).

**Working hours** — A viewer's own timezone, work window (`start_minute`–`end_minute`), ISO work days and buffer percentage, stored in `state_work_hours`. When no row exists the viewer inherits `planning.work_defaults`. Unavailable windows, recurring by `weekday` or one-off by `date`, subtract from the work window. See [Plan your day](../how-to/plan/plan-your-day.md#set-your-working-hours).

**Buffer** — The share of the work window reserved for slack, set by `buffer_percent` (`0..90`, default `20`). Auto-plan spends at most `available − buffer` on issues and writes the reserve as explicit `buffer` blocks; leftover space under 15 minutes extends the previous block instead. Buffer blocks are excluded from per-issue planned-versus-actual review. See [Plan your day](../how-to/plan/plan-your-day.md#plan-a-day).

**Day plan** — The set of `state_day_block` rows for one viewer and one local `YYYY-MM-DD`, each an `issue` or `buffer` block with a local `start_minute` and `minutes`. Replacing a date replaces every block for it. Manual plans may overrun the work window — the day view flags it — while only auto-plan enforces hours and buffer. See [Database schema](./database-schema.md#state_day_block).

**Calendar feed** — A viewer's read-only ICS subscription at `/api/calendar/{token}.ics`, covering today − 7 days through today + 42 days with issue blocks, buffer blocks and unavailable windows as opaque UTC events. The token is 32 random bytes (43 base64url characters); only its SHA-256 hash and an eight-character hint are stored, the raw URL is shown once, and regenerating or revoking it invalidates the previous link immediately. No session is required, so the URL is a secret. See [Plan your day](../how-to/plan/plan-your-day.md#subscribe-outlook-to-the-calendar-feed).

**Actual time** — The union of observed intervals where an issue is open and its status is `in-progress` or `in-review`. Both active statuses count, so time in review is part of actual time. Active time is derived from the durable `state_issue_event` log and ends at `closedAt` when the issue closes. Tracking starts at deployment or first observation; there is no historical backfill, so issues that predate the feature show time from the migration timestamp onward. See [Track time and delays](../how-to/use/track-time-and-delays.md).

**Delay** — A durable interval in `state_issue_delay` when work is waiting, with a reason (`dependency`, `info`, `review`, `external`, `capacity` or `other`), an optional note, and a source of `blocked` or `manual`. The `blocked` flag opens and closes automatic delays; manual delays are recorded from the Inspector and are local-only. Delay minutes are the union of all intervals, so an overlap between a blocked and a manual delay counts once. See [Track time and delays](../how-to/use/track-time-and-delays.md).

**Epic** — An ordinary issue carrying the `epic` label. Its ordered children are a comma-separated `owner/name#number` list in the epic body's `funnel_metadata` envelope (`epic.children`), which makes the relation portable and independent of the mirror. An issue belongs to at most one epic; nested epics are rejected. `/epics` and the Inspector show progress and estimate, actual and delay rollups. See [Manage epics](../how-to/use/epics.md).

**Intake** — Funnel's public submission channel, available as the `/intake` form and `POST /api/intake`. Anonymous submissions are staged locally and nothing reaches GitHub until a triager accepts them. See [HTTP API](./http-api.md#public-surface).

**Staging** — The `state_intake_submission` queue that holds pending intake submissions. Rows are hard-deleted on accept, dismiss or duplicate; there is no trash bin or archive. See [`staging.ts`](../../src/lib/server/intake/staging.ts).

**Triage** — The decision that clears a staged submission: **accept** creates a GitHub issue with the `backlog` status and a provenance footer, **duplicate** posts the submission text as a comment on a mirrored issue, and **dismiss** deletes the row without contacting GitHub. Accept and duplicate use the signed-in user's GitHub token. See [Routes and pages](./routes-and-pages.md#inbox-triage-actions).

**Work note** — An internal ITSM-style journal entry stored in `state_work_note`. A work note is local to Funnel and is not posted to GitHub unless explicitly published; publishing posts it as a comment and deletes the local note. Work notes are keyed by `org/name` plus issue number, so they survive mirror pruning. See [HTTP API](./http-api.md#work-notes).

**Notification** — A durable per-user record of an assignment, mention, watched-issue comment, status/priority/open-closed change, or new intake submission, stored in `state_notification`. Each row snapshots its title, body, actor and link so the notification center never reads the disposable mirror; rows are unread until marked read and have no automatic expiry. See [Use notifications](../how-to/use/notifications.md).

**Watch** — A per-user subscription to one issue, stored in `state_issue_watch` and keyed by `org/name` plus issue number. Watching delivers comment and status/priority/open-closed notifications for that issue; it is personal and survives mirror rebuilds. See [Use notifications](../how-to/use/notifications.md#watch-an-issue).

**Native notification** — A browser notification shown while a Funnel tab is open. It is opt-in per browser after the browser grants permission, is controlled instance-wide by `notifications.native`, and never runs in the background or through a service worker. See [Use notifications](../how-to/use/notifications.md#browser-notifications).

**Dropbox / attachment** — The Inspector's file-upload surface. Metadata lives in `state_attachment`; bytes live under `FUNNEL_UPLOAD_DIR`. The on-disk path is server-generated (`<yyyy>/<mm>/<uuid>`), the original filename is sanitised, and a SHA-256 hash is stored. See [HTTP API](./http-api.md#attachments).

**Inspector** — The docked detail pane used by the Issues, Board and Inbox views. It shows the issue, its rendered body and comments, work notes, attachments, labels and assignees, and fetches its payload from `/api/mirror/issues/{owner}/{repo}/{number}`. See [Routes and pages](./routes-and-pages.md#detail-routes).

**Attention** — The view of open issues flagged `blocked` that carry a re-check date in their body metadata. Items are bucketed as overdue, today or upcoming within seven days; the sidebar badge counts overdue plus today. See [`attention.ts`](../../src/lib/attention.ts).

**Notification center** — The personal `/notifications` page. It lists unread rows before read rows, newest first, shows the actor, destination and relative time, and offers per-row and mark-all read controls. The sidebar badge shows the same unread count. See [Use notifications](../how-to/use/notifications.md).

**WIP limit** — A per-stage Work-in-Progress cap configured in `board.wip_limits` for the open statuses (`backlog`, `todo`, `in-progress`, `in-review`). The board shows the count against the limit and highlights a column that exceeds it; the limit is advisory and does not block moves. `done` is never capped. See [`store.ts`](../../src/lib/server/settings/store.ts).

**RBAC** — Funnel's instance-wide role hierarchy `read < write < admin`, stored on `auth_user.role` and managed through the Better Auth admin plugin. `read` views the cockpit; `write` adds issue, comment, label, work-note, attachment and triage mutations; `admin` adds instance settings and people management. New accounts default to `read`, the first account is promoted to `admin`, and the last administrator cannot be demoted. See [Routes and pages](./routes-and-pages.md#access-control).

**App installation** — The GitHub App being installed on a user account or organisation, which grants Funnel access to the selected repositories. The installation id is stored on `state_github_app`; installation tokens are used for mirror reads and background sync. See [`manifest-flow.server.ts`](../../src/lib/server/github/manifest-flow.server.ts).

**Manifest flow** — GitHub's App Manifest Flow used during onboarding. Funnel posts a generated manifest to GitHub, receives a temporary conversion code at `/onboarding/callback`, exchanges it for App credentials, then installs the App and records the selected repositories. Credentials are stored encrypted in `state_github_app`. See [Routes and pages](./routes-and-pages.md#public-and-first-run-routes).

**SSE** — Server-Sent Events. `GET /api/events` keeps a long-lived stream open for signed-in `read` users, sends a heartbeat comment every 12 seconds, and forwards named `sync`, `issues`, `intake`, `settings`, `notifications` and `planning` events so open cockpits can refresh. See [HTTP API](./http-api.md#event-stream).

**Readiness** — The `/readyz` probe: it requires the database to be reachable and, when the migrations folder can be located, every committed migration to be applied before the instance reports `ready`. It returns `503` with a `starting` status until then, keeping traffic off a half-migrated instance. See [HTTP API](./http-api.md#health-and-readiness).

**Liveness** — The `/healthz` probe: it reports that the process is running and deliberately touches no database or network state, so a failing dependency does not cause an orchestrator to restart the process.

## Related

- [HTTP API](./http-api.md)
- [Database schema](./database-schema.md)
- [Routes and pages](./routes-and-pages.md)
- [Feature flags](./feature-flags.md)
- [Configure estimates and weekly plans](../how-to/configure/planning.md)
