# Database schema

Funnel stores all durable state, auth records and the disposable GitHub mirror in one SQLite database defined by `src/lib/server/db/schema.ts`.

## Conventions

### Table ownership

| Prefix | Owner | Durability |
| :--- | :--- | :--- |
| `state_*` | Funnel | Durable Funnel-owned state. Backed up; never truncated by sync. |
| `auth_*` | Better Auth | Durable authentication state. Columns use the library's camelCase names. |
| `mirror_*` | Funnel sync | Disposable forge cache, rebuildable by a re-sync and prunable by the history window or reconciliation. |

`state_intake_submission` is durable storage but a pending queue by design: a triage decision archives the row (`archived_at`), and the append-only `state_triage_event` table records the decision history.

### Timestamps

- `state_*` and `mirror_*` timestamps are integer Unix milliseconds, written with `Date.now()` or parsed from GitHub timestamps.
- `auth_*` columns declared with Drizzle `{ mode: "timestamp" }` are integer Unix seconds; values are `Date` objects at the adapter boundary.
- Boolean columns are integer `0`/`1`; the schema uses `{ mode: "boolean" }` for `auth_user.emailVerified` and `auth_user.banned`, and plain integers for mirror flags such as `archived`, `degraded`, `blocked` and `label_conflict`.

### Identity conventions

- A mirrored issue is identified by `(repo_id, number)`.
- A mirrored milestone is identified by `(repo_id, number)`, because GitHub scopes a milestone to one repository. An issue's milestone is stored as `milestone_number` with no foreign key to the milestone row.
- A mirrored thread is identified by `(repo_id, number)`; its forge-native id is `external_id` (text, because ids are opaque across forges). REST polling yields `node_id`s for hydration, and the GraphQL response's `databaseId` populates `external_id`.
- Repositories are identified by `(forge, instance, external_id)`, which survives renames; `(forge, instance, org, name)` is unique. The internal `id` is the only foreign-key target.
- Funnel-local work notes and attachments are keyed by `org/name` plus thread number, not by the disposable mirror thread row, so they survive mirror pruning and re-sync.
- Inbox snoozes share that durable issue identity (`owner/name` plus number) and key submissions by their staged id.
- People are keyed by `(forge, instance, external_id)` and referenced internally by `mirror_user.id`. Better Auth users use a separate text id; `auth_account.accountId` stores the GitHub account id as a string for the `github` provider.

## State tables

### `state_intake_submission`

Staged public intake submissions, newest first in the Inbox. A triage decision archives the row instead of deleting it; pending queries only read `archived_at IS NULL`.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `title` | TEXT | Not null. |
| `body` | TEXT | Not null, default `''`. |
| `source` | TEXT | Nullable provenance label. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `archived_at` | INTEGER | Nullable, Unix ms; set when a decision removes the row from the pending queue. |
| `dismiss_reason` | TEXT | Nullable; required free text captured by a dismiss decision (max 500 characters). Cleared when the dismissal is undone. |
| `duplicate_repo` | TEXT | Nullable `owner/name` recorded by a duplicate decision. |
| `duplicate_number` | INTEGER | Nullable issue number recorded by a duplicate decision. |

Primary key: `id`. Foreign keys: none. Indexes: none; pending listing orders by `created_at DESC, rowid DESC` to break same-millisecond ties.

### `state_triage_event`

Append-only triage history for intake submissions. Rows are keyed by submission id rather than a foreign key, so the history survives the submission being archived or removed. There are no update/delete helpers: undo appends an `undone` event and restores the submission.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `submission_id` | TEXT | Not null; the staged submission id (no foreign key). |
| `action` | TEXT | Not null; `accepted`, `dismissed`, `duplicated` or `undone`. |
| `actor_user_id` | TEXT | Not null; `auth_user.id` of the triager. |
| `repo` | TEXT | Nullable `owner/name` of the created issue or duplicate target. |
| `number` | INTEGER | Nullable issue number of the created issue or duplicate target. |
| `reason` | TEXT | Nullable dismiss reason; `undone` carries the original reason forward. |
| `created_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys: none. Indexes:

- `idx_state_triage_event_submission` on `(submission_id, created_at)`.

### `state_snooze`

Durable Inbox snoozes. A snooze hides a staged submission or an untriaged mirrored issue from the pending queue until `snoozed_until` passes, then the row returns automatically because pending reads compare against the current time. Issues are keyed by `owner/name` plus number rather than a mirror foreign key, so a snooze survives mirror pruning and a re-sync. `key` is the stable upsert identity: `submission:<id>` or `issue:<owner/name>#<number>`.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `key` | TEXT | Primary key; `submission:<id>` or `issue:<owner/name>#<number>`. |
| `submission_id` | TEXT | Nullable; set for a staged submission snooze. |
| `repo` | TEXT | Nullable `owner/name`; set for an issue snooze. |
| `number` | INTEGER | Nullable issue number; set for an issue snooze. |
| `snoozed_until` | INTEGER | Not null, Unix ms; the item is hidden while this is greater than the current time. Validated to be in the future and at most one year away. |
| `created_at` | INTEGER | Not null, Unix ms when the snooze was last set. |
| `actor_user_id` | TEXT | Nullable `auth_user.id` of the person who snoozed it. |

Primary key: `key`. Foreign keys: none; the issue identity is the durable `org/name` plus number and the submission identity is its staged id. Indexes:

- `idx_state_snooze_until` on `(snoozed_until)`.
- `idx_state_snooze_submission` on `(submission_id)`.
- `idx_state_snooze_issue` on `(repo, number)`.

Triage or a status change clears the matching row: accepting, dismissing or duplicating a submission, and writing an issue status, both remove it.

### `state_issue_waiting`

Funnel-local "waiting on someone else" state. A waiting issue is parked until the reporter, a vendor or an upstream project responds; it is deliberately separate from the GitHub `blocked` flag, which records work that is in flight but held up. Rows are keyed by `owner/name` plus issue number rather than a mirror foreign key, so they survive mirror pruning and a re-sync. Funnel never writes this state to GitHub: the issue body, labels and comments are untouched, and the `funnel_metadata` envelope is not used.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo` | TEXT | Not null; `owner/name`, part of the key. |
| `number` | INTEGER | Not null; issue number, part of the key. |
| `reason` | TEXT | Not null; `needs-info`, `waiting-on-reporter`, `waiting-on-vendor`, `waiting-on-upstream` or `other`. |
| `note` | TEXT | Nullable free text, at most 2000 characters; an empty note is stored as `NULL`. |
| `waiting_since` | INTEGER | Not null, Unix ms when the wait began. Preserved when the reason or re-check date is revised; reset only by clearing and setting the state again. |
| `recheck_on` | TEXT | Nullable `YYYY-MM-DD` re-check date; validated as a real calendar date. |
| `actor_user_id` | TEXT | Nullable `auth_user.id` of the person who marked it waiting. |

Primary key: `(repo, number)`. Foreign keys: none; the mirror is disposable. Indexes:

- `idx_state_issue_waiting_since` on `(waiting_since)` for the oldest-first Attention feed and stale checks.
- `idx_state_issue_waiting_recheck` on `(recheck_on)`.

A wait older than seven calendar days is **stale** (`WAITING_STALE_DAYS` in `src/lib/waiting.ts`); exactly seven days is not stale, the next day is. Staleness is derived at read time, so changing the threshold needs no migration. Clearing the row is immediate and is the only thing that resets `waiting_since`.

### `state_saved_view`

Named URL presets for the Issues and Inbox views. The URL stays the runtime source of truth: a saved view stores the query string, sort/direction and grouping needed to reopen a view, but later filter edits are not auto-saved. Rows are owned by `auth_user.id` and may be shared with every signed-in user. Shared views are readable by all and editable only by their owner (or an admin); personal views are visible only to their owner.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `owner_user_id` | TEXT | Not null; the owner's `auth_user.id`, not a foreign key. |
| `name` | TEXT | Not null; trimmed, 1–120 characters. Unique per owner, case-insensitively. |
| `query` | TEXT | Not null, default `''`; URL query string without `?`, limited to filter keys plus Inbox `snoozed=0|1`. Sort and direction are stored in their own columns. |
| `scope` | TEXT | Not null; `issues` or `inbox` and the path the view opens. |
| `sort` | TEXT | Nullable; `priority`, `updated`, `created` or `title`. Null inherits the stream default. |
| `direction` | TEXT | Nullable; `asc` or `desc`. Null inherits the stream default. |
| `group` | TEXT | Nullable; `none`, `status`, `priority`, `project`, `repo` or `milestone`. Grouping is client preference state, not part of the URL. |
| `shared` | INTEGER | Not null, default `0`; `1` makes the view readable by every signed-in user. |
| `pinned` | INTEGER | Not null, default `0`; pinned views sort first in the switcher. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms; advanced by rename, pin, sharing or filter refresh. |

Primary key: `id`. Foreign keys: none; the owner is the durable `auth_user.id`. Indexes:

- `uq_state_saved_view_owner_name` unique on `(owner_user_id, lower(name))`, so one owner cannot store `Mine` and `mine`.
- `idx_state_saved_view_owner` on `(owner_user_id)`.
- `idx_state_saved_view_scope_shared` on `(scope, shared)`.

Opening a view never mutates an issue or the mirror; create, update and delete only touch this table.

### `state_comment_reaction`

The signed-in user's own reactions on mirrored comments. GitHub aggregates counts on the comment, but reports the viewer's own choices only to a request made with that viewer's token; the detail read is served from the local mirror, so this table supplies the filled chips. It is an additive best-effort cache, not the authoritative count.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `user_id` | TEXT | Not null; the acting user's `auth_user.id`, not a foreign key. |
| `repo` | TEXT | Not null; `owner/name` of the comment's repository. |
| `comment_external_id` | TEXT | Not null; forge-native comment id (`mirror_comment.external_id`). |
| `content` | TEXT | Not null; `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`, `rocket` or `eyes`. |
| `created_at` | INTEGER | Not null, Unix ms. |

Primary key: `(user_id, repo, comment_external_id, content)`. Foreign keys: none; the comment identity is durable across mirror pruning. Index `idx_state_comment_reaction_comment` on `(repo, comment_external_id)` supports the detail read. Removing a reaction deletes its row; a comment deleted directly on GitHub leaves the row harmlessly behind.

### `state_notification`

Per-user notification rows. Each row snapshots everything the notification center renders, including the title, body and actor, so reading the feed never depends on the disposable mirror. Rows are durable; read state is tracked and there is no automatic expiry.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `user_id` | TEXT | Not null; the recipient's `auth_user.id`, not a foreign key. |
| `kind` | TEXT | Not null; `assigned`, `mentioned`, `comment`, `status`, `priority`, `state`, `new_intake` or `sla`. |
| `dedupe_key` | TEXT | Not null; names the GitHub event, intake submission or attention-rule day that produced the row, for example `status:org/name#7:<userId>:<event>` or `sla:<rule>:org/name#7:<userId>:<UTC date>`. Unique across all users. |
| `title` | TEXT | Not null, default `''`. |
| `body` | TEXT | Not null, default `''`; a 140-character excerpt for comments and mentions. |
| `url` | TEXT | Not null, default `''`; `/issues/{owner}/{repo}/{number}` or `/inbox/submission/{id}`. |
| `actor_login` | TEXT | Nullable; snapshotted GitHub login. |
| `actor_avatar_url` | TEXT | Nullable; snapshotted avatar URL. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `read_at` | INTEGER | Nullable, Unix ms; `null` means unread. |

Primary key: `id`. Foreign keys: none; the recipient id and actor identity are deliberately snapshotted. Indexes:

- `uq_state_notification_dedupe` unique on `(dedupe_key)`.
- `idx_state_notification_user_created` on `(user_id, created_at)`.
- `idx_state_notification_user_read` on `(user_id, read_at)`.

### `state_issue_watch`

Which Funnel user watches which issue. The issue identity is the durable `org/name` plus number rather than a mirror foreign key, so watches survive mirror pruning and a re-sync.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `user_id` | TEXT | Not null; the watcher's `auth_user.id`, not a foreign key. |
| `org` | TEXT | Not null; repository owner. |
| `name` | TEXT | Not null; repository name. |
| `issue_number` | INTEGER | Not null. |
| `created_at` | INTEGER | Not null, Unix ms. |

Primary key: `(user_id, org, name, issue_number)`. Foreign keys: none. Indexes:

- `idx_state_issue_watch_issue` on `(org, name, issue_number)`.

### `state_setting`

Normalised instance settings as JSON-encoded key/value rows. Lists (`repos`, `projects`) are stored under one key as a JSON array.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `key` | TEXT | Primary key; dotted path such as `sync.history_days`. |
| `value` | TEXT | Not null; JSON-encoded value. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `key`. Foreign keys: none. Indexes: none.

Known keys: `repos`, `projects`, `intake.default_repo`, `sync.history_days`, `sync.poll_interval_active_seconds`, `sync.poll_interval_idle_seconds`, `sync.pr_in_review`, `sync.pr_done`, `board.done_days`, `board.wip_limits`, `session.idle_days`, `notifications.enabled`, `notifications.native`, `notifications.new_intake`, `planning.size_minutes`, `planning.allocation_percent`, `planning.cycle_weeks`, `planning.cycle_anchor`, `planning.maintainers`, `attention.first_response_days`, `attention.stale_open_days`, `attention.recheck_cadence_days`, `attention.waiting_days`. `github.url` and `github.api_url` are environment values and are not stored here. Missing, unparseable or invalid rows fall back to per-key defaults.

### `state_plan_item`

One issue scheduled into one Monday week. Plan items are durable Funnel-owned state: they are never written to GitHub, and because identity is the `org/name` slug plus issue number rather than a mirror foreign key, they survive mirror pruning and `clearMirror`. Planned minutes are not stored — they are derived from the issue's current size label, so changing `planning.size_minutes` or the size label re-prices the item.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `org` | TEXT | Not null; repository owner, part of the key. |
| `name` | TEXT | Not null; repository name, part of the key. |
| `issue_number` | INTEGER | Not null; part of the key. |
| `week_start` | TEXT | Not null; the Monday date of the planned week in `YYYY-MM-DD` form (UTC). |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `(org, name, issue_number)`; one plan item per issue, so re-scheduling updates the existing row. Foreign keys: none; the mirror is disposable. Indexes:

- `idx_state_plan_item_week` on `(week_start)` for week and cycle reads.

### Legacy daily-planning tables

The four tables below belonged to the removed daily planner. They are retained in existing databases so an upgrade is non-destructive, but no current application code reads or writes them. They are documented here only so an operator inspecting an older database can identify the rows. New installations do not need to populate them.

### `state_work_hours`

One viewer's working hours for the former ALPEN day planner. This table is legacy and unused by the weekly planner.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `user_id` | TEXT | Primary key; the viewer's `auth_user.id`, `ON DELETE CASCADE`. |
| `timezone` | TEXT | Not null; a valid IANA zone name such as `Europe/Berlin`. |
| `start_minute` | INTEGER | Not null; local minutes from midnight, `0..1439`. |
| `end_minute` | INTEGER | Not null; local minutes from midnight, greater than `start_minute` and at most `1440`. |
| `work_days` | TEXT | Not null; JSON array of ISO weekday integers `1..7`, non-empty and duplicate-free. |
| `buffer_percent` | INTEGER | Not null; `0..90`. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `user_id`. Foreign keys: `user_id` → `auth_user.id` on delete `CASCADE`. Indexes: none beyond the primary key.

### `state_unavailable_window`

Legacy daily-planner windows. A window is either weekly (`weekday`) or dated (`date`), never both. No current code reads or writes this table.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `user_id` | TEXT | Not null; the viewer's `auth_user.id`, `ON DELETE CASCADE`. |
| `label` | TEXT | Not null; at most 60 characters, such as `Lunch`. |
| `weekday` | INTEGER | Nullable; ISO weekday `1..7` for a recurring window. |
| `date` | TEXT | Nullable; a real `YYYY-MM-DD` for a one-off window. |
| `start_minute` | INTEGER | Not null; `0..1439`. |
| `end_minute` | INTEGER | Not null; greater than `start_minute` and at most `1440`. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys: `user_id` → `auth_user.id` on delete `CASCADE`. Exactly one of `weekday` and `date` is set; a check applies at validation. Indexes:

- `idx_state_unavailable_window_user` on `(user_id)`.

### `state_day_block`

Legacy daily-planner blocks. Blocks are local minutes from midnight rather than instants. An `issue` block names an issue by `org/name` plus number; a `buffer` block carried reserved slack. No current code reads or writes this table.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `user_id` | TEXT | Not null; the viewer's `auth_user.id`, `ON DELETE CASCADE`. |
| `date` | TEXT | Not null; real `YYYY-MM-DD` in the viewer's timezone. |
| `start_minute` | INTEGER | Not null; local minutes from midnight, `0..1439`. |
| `minutes` | INTEGER | Not null; at least `5`, and `start_minute + minutes <= 1440`. |
| `kind` | TEXT | Not null; `issue` or `buffer`. |
| `org` | TEXT | Nullable; set only for `issue` blocks. |
| `name` | TEXT | Nullable; set only for `issue` blocks. |
| `issue_number` | INTEGER | Nullable; set only for `issue` blocks. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys: `user_id` → `auth_user.id` on delete `CASCADE`. `org`, `name` and `issue_number` are all set for an `issue` block and all null for a `buffer` block. The issue is identified by its durable slug, so a block survives mirror pruning. Indexes:

- `idx_state_day_block_user_date` on `(user_id, date)`.

### `state_calendar_feed`

Legacy tokenized ICS feed metadata for the removed day planner. The raw token was never stored: only its SHA-256 hex hash and the first eight characters as a hint. No current code reads or writes this table.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `user_id` | TEXT | Primary key; the viewer's `auth_user.id`, `ON DELETE CASCADE`. |
| `token_hash` | TEXT | Not null; SHA-256 hex of the 43-character base64url token. |
| `token_hint` | TEXT | Not null; the token's first eight characters, for display only. |
| `created_at` | INTEGER | Not null, Unix ms. |

Primary key: `user_id`. Foreign keys: `user_id` → `auth_user.id` on delete `CASCADE`. `token_hash` is unique, so one live feed row exists per token.

### `state_issue_event`

Observed workflow transitions for one issue, keyed by the durable `org/name` slug plus issue number rather than a mirror foreign key. The log is append-only and durable: rows are never pruned with the mirror.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `org` | TEXT | Not null; repository owner. |
| `name` | TEXT | Not null; repository name. |
| `issue_number` | INTEGER | Not null. |
| `kind` | TEXT | Not null; `status`, `state`, `blocked`, `priority`, `label` or `assignee`. |
| `from_value` | TEXT | Nullable; the previous value, or `null` for a baseline or an addition. |
| `to_value` | TEXT | Nullable; the observed value, or `null` for a removal. |
| `at` | INTEGER | Not null, Unix ms. |
| `source` | TEXT | Not null; `sync` for events observed by the sync worker, `migration` for baselines seeded at deploy. |

Primary key: `id`. Foreign keys: none. Indexes:

- `idx_state_issue_event_issue_at` on `(org, name, issue_number, at)`.

On first observation every issue gets baseline `status`, `state` and `blocked` rows with `from_value` `null`. The migration seeds the same baselines for issues already mirrored, at the migration timestamp. There is no historical backfill from the forge timeline.

After a previous snapshot exists, the recorder also appends `priority` rows when the derived P1–P3 changes, one `label` row per added (`to_value` = name, `from_value` = null) or removed (`from_value` = name, `to_value` = null) label, and one `assignee` row per added or removed assignee using the login as the value. These three kinds deliberately skip first-sighting baselines: an old issue's existing labels and assignees are not retold as activity. Names are compared case-insensitively so a casing-only re-sync writes nothing. Only `status` and `state` feed the actual-time arithmetic.

### `state_issue_delay`

Delay intervals for one issue: automatic rows opened by the `blocked` flag and manual rows recorded from the Inspector. Total delay time is the union of the intervals, so overlapping rows count once. Rows are durable and never pruned with the mirror.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `org` | TEXT | Not null; repository owner. |
| `name` | TEXT | Not null; repository name. |
| `issue_number` | INTEGER | Not null. |
| `reason` | TEXT | Not null; `dependency`, `info`, `review`, `external`, `capacity` or `other`. |
| `started_at` | INTEGER | Not null, Unix ms. |
| `ended_at` | INTEGER | Nullable, Unix ms; `null` means the delay is still open. |
| `note` | TEXT | Not null, default `''`. |
| `source` | TEXT | Not null; `blocked` or `manual`. |

Primary key: `id`. Foreign keys: none. Indexes:

- `idx_state_issue_delay_issue_started` on `(org, name, issue_number, started_at)`.
- `idx_state_issue_delay_ended` on `(ended_at)`.

Adding the `blocked` flag opens a `source = blocked` delay using the reason from the issue's `funnel_metadata`; removing it closes the open blocked row. Closing the issue closes every open delay. The migration opens one `other` delay for every issue blocked at deploy time. Manual rows are editable and deletable; blocked rows are read-only.

### `state_github_app`

The single GitHub App created by the onboarding manifest flow. It is the source of truth for App credentials; there are no credential environment variables.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; singleton value `default`. |
| `app_id` | INTEGER | Not null. |
| `slug` | TEXT | Not null. |
| `name` | TEXT | Not null. |
| `owner_login` | TEXT | Not null, default `''`. |
| `owner_type` | TEXT | Not null, default `''`; `User` or `Organization`. |
| `html_url` | TEXT | Not null, default `''`. |
| `base_url` | TEXT | Not null, default `''`; public origin captured at App creation. |
| `client_id` | TEXT | Not null. |
| `client_secret_enc` | TEXT | Not null; encrypted with a key derived from `FUNNEL_SECRET`. |
| `webhook_secret_enc` | TEXT | Nullable; encrypted. |
| `private_key_enc` | TEXT | Not null; encrypted RSA key. |
| `installation_id` | INTEGER | Nullable. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys: none. Indexes: none.

### `state_webhook_delivery`

Accepted GitHub webhook deliveries, one row per `x-github-delivery`. The row is written only after the delivery's refreshes succeed, so a failed delivery can be retried by GitHub. Duplicate ids are acknowledged without refreshing again, and rows older than seven days are pruned on each accepted delivery.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; GitHub's `x-github-delivery` UUID. |
| `event` | TEXT | Not null; `x-github-event`, e.g. `issues` or `pull_request`. |
| `action` | TEXT | Nullable; payload `action` when present. |
| `repo` | TEXT | Nullable; `owner/name` when the payload identified a repository. |
| `received_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys: none. Indexes:

- `idx_state_webhook_delivery_received` on `(received_at)`.

### `state_work_note`

Internal ITSM-style journal entries. They are never posted to GitHub unless explicitly published; publishing posts a comment and deletes the note.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `org` | TEXT | Not null; repository owner. |
| `name` | TEXT | Not null; repository name. |
| `issue_number` | INTEGER | Not null. |
| `author_external_id` | TEXT | Nullable; snapshot, not a foreign key. |
| `author_forge` | TEXT | Not null; snapshot, e.g. `github`. |
| `author_instance` | TEXT | Not null; snapshot host, e.g. `github.com`. |
| `author_login` | TEXT | Not null, default `''`; snapshot. |
| `author_avatar_url` | TEXT | Not null, default `''`; snapshot. |
| `body` | TEXT | Not null, default `''`. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys: none; the author identity is deliberately snapshotted so a note survives mirror pruning and user rebuilds. Indexes:

- `idx_state_work_note_issue` on `(org, name, issue_number, created_at)`.

### `state_attachment`

Metadata for issue attachment files. Bytes live on disk under `FUNNEL_UPLOAD_DIR`.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `org` | TEXT | Not null; repository owner. |
| `name` | TEXT | Not null; repository name. |
| `issue_number` | INTEGER | Not null. |
| `filename` | TEXT | Not null; sanitised original filename. |
| `stored_path` | TEXT | Not null; server-generated relative path `<yyyy>/<mm>/<uuid>`. |
| `mime_type` | TEXT | Not null, default `application/octet-stream`. |
| `size_bytes` | INTEGER | Not null. |
| `sha256` | TEXT | Not null, default `''`; content hash. |
| `uploaded_by_external_id` | TEXT | Nullable; snapshot, not a foreign key. |
| `uploaded_by_forge` | TEXT | Not null; snapshot, e.g. `github`. |
| `uploaded_by_instance` | TEXT | Not null; snapshot host, e.g. `github.com`. |
| `uploaded_by_login` | TEXT | Not null, default `''`; snapshot. |
| `created_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys: none. Indexes:

- `idx_state_attachment_issue` on `(org, name, issue_number, created_at)`.

## Auth tables

These tables match Better Auth's stock schema. `role`, `banned`, `banReason` and `banExpires` are declared by the admin plugin. A null `role` is treated as `read` by Funnel's RBAC helpers.

### `auth_user`

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key. |
| `name` | TEXT | Not null. |
| `email` | TEXT | Not null, unique. |
| `emailVerified` | INTEGER (boolean) | Not null, default `0`. |
| `image` | TEXT | Nullable. |
| `role` | TEXT | Nullable; `read`, `write` or `admin`. |
| `banned` | INTEGER (boolean) | Not null, default `0`. |
| `banReason` | TEXT | Nullable. |
| `banExpires` | INTEGER (timestamp) | Nullable. |
| `createdAt` | INTEGER (timestamp) | Not null. |
| `updatedAt` | INTEGER (timestamp) | Not null. |

Primary key: `id`. Foreign keys: none. Indexes: unique constraint on `email`.

### `auth_session`

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key. |
| `expiresAt` | INTEGER (timestamp) | Not null. |
| `token` | TEXT | Not null, unique. |
| `createdAt` | INTEGER (timestamp) | Not null. |
| `updatedAt` | INTEGER (timestamp) | Not null. |
| `ipAddress` | TEXT | Nullable. |
| `userAgent` | TEXT | Nullable. |
| `impersonatedBy` | TEXT | Nullable; set by the admin plugin during impersonation. |
| `userId` | TEXT | Not null; FK to `auth_user.id`. |

Primary key: `id`. Foreign keys:

- `userId` → `auth_user.id` on delete `CASCADE`.

Indexes:

- `idx_auth_session_user` on `(userId)`.

### `auth_account`

Links a Funnel account to its OAuth provider account. GitHub access and refresh tokens are encrypted at rest by Better Auth when `encryptOAuthTokens` is enabled.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key. |
| `accountId` | TEXT | Not null; provider subject. For GitHub this is the numeric user id as a string. |
| `providerId` | TEXT | Not null; `github` for GitHub accounts. |
| `userId` | TEXT | Not null; FK to `auth_user.id`. |
| `accessToken` | TEXT | Nullable; encrypted ciphertext. |
| `refreshToken` | TEXT | Nullable; encrypted ciphertext. |
| `idToken` | TEXT | Nullable. |
| `accessTokenExpiresAt` | INTEGER (timestamp) | Nullable. |
| `refreshTokenExpiresAt` | INTEGER (timestamp) | Nullable. |
| `scope` | TEXT | Nullable. |
| `password` | TEXT | Nullable. |
| `createdAt` | INTEGER (timestamp) | Not null. |
| `updatedAt` | INTEGER (timestamp) | Not null. |

Primary key: `id`. Foreign keys:

- `userId` → `auth_user.id` on delete `CASCADE`.

Indexes:

- `idx_auth_account_user` on `(userId)`.

### `auth_verification`

Better Auth verification records.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key. |
| `identifier` | TEXT | Not null. |
| `value` | TEXT | Not null. |
| `expiresAt` | INTEGER (timestamp) | Not null. |
| `createdAt` | INTEGER (timestamp) | Nullable. |
| `updatedAt` | INTEGER (timestamp) | Nullable. |

Primary key: `id`. Foreign keys: none. Indexes: none.

## Mirror tables

### `mirror_repo`

Configured repositories that sync has seen. The forge-native id survives renames.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | INTEGER | Primary key; autoincrement. The internal foreign-key target. |
| `forge` | TEXT | Not null; `github`. |
| `instance` | TEXT | Not null; instance host, such as `github.com`. |
| `external_id` | TEXT | Not null; forge-native repository id. |
| `org` | TEXT | Not null. |
| `name` | TEXT | Not null. |
| `url` | TEXT | Not null, default `''`; web URL. |
| `etag` | TEXT | Nullable; persisted REST ETag for conditional polling. |
| `archived` | INTEGER | Not null, default `0`; 0/1. |
| `degraded` | INTEGER | Not null, default `0`; 0/1. |
| `last_polled_at` | INTEGER | Nullable, Unix ms. |
| `last_reconciled_at` | INTEGER | Nullable, Unix ms. |

Primary key: `id`. Foreign keys: none. Indexes:

- `uq_mirror_repo_external` unique on `(forge, instance, external_id)`.
- `uq_mirror_repo_slug` unique on `(forge, instance, org, name)`.

### `mirror_user`

Mirrored forge people: authors, assignees and collaborators.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | INTEGER | Primary key; autoincrement. The internal foreign-key target. |
| `forge` | TEXT | Not null; `github`. |
| `instance` | TEXT | Not null; instance host, such as `github.com`. |
| `external_id` | TEXT | Not null; forge-native account id. |
| `login` | TEXT | Not null. |
| `avatar_url` | TEXT | Not null, default `''`. |
| `url` | TEXT | Not null, default `''`; profile URL. |

Primary key: `id`. Foreign keys: none. Indexes:

- `uq_mirror_user_external` unique on `(forge, instance, external_id)`.
- `uq_mirror_user_login` unique on `(forge, instance, login)`.

### `mirror_milestone`

Per-repository milestones. GitHub scopes a milestone to exactly one repository, so identity is `(repo_id, number)`; the same title in two repositories is two rows. The set is replaced wholesale on each milestone refresh, so threads reference a milestone by number without a foreign key.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_repo.id`. |
| `number` | INTEGER | Not null; per-repo milestone number. |
| `external_id` | TEXT | Not null, default `''`; forge-native global id, or empty when only REST has been seen. |
| `title` | TEXT | Not null, default `''`. |
| `description` | TEXT | Not null, default `''`. |
| `state` | TEXT | Not null, default `'open'`; `open` or `closed`. |
| `due_on` | INTEGER | Nullable, Unix ms. |
| `open_issues` | INTEGER | Not null, default `0`. |
| `closed_issues` | INTEGER | Not null, default `0`. |
| `creator_id` | INTEGER | Nullable; FK to `mirror_user.id`. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |
| `closed_at` | INTEGER | Nullable, Unix ms. |
| `url` | TEXT | Not null, default `''`. |

Primary key: `(repo_id, number)`. Foreign keys:

- `repo_id` → `mirror_repo.id` on delete `CASCADE`.
- `creator_id` → `mirror_user.id` on delete `SET NULL`.

Indexes: the composite primary key only.

### `mirror_thread`

The issue cache. Pull requests never become rows here: their development context lives in `mirror_pull_request` and `mirror_issue_pull_request`. `status`, `impact`, `urgency`, `size` and `blocked` are derived caches of the active reserved-label groups, recomputed at sync time; `priority` is the derived P1–P3 cache. Done/Cancelled derive from `(state, state_reason)`.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_repo.id`. |
| `number` | INTEGER | Not null; per-repo thread number. |
| `external_id` | TEXT | Not null; forge-native global id (`databaseId` as text). |
| `kind` | TEXT | Not null, default `'issue'`; a pull request would be `pull_request`. |
| `title` | TEXT | Not null. |
| `body` | TEXT | Not null, default `''`. |
| `state` | TEXT | Not null; `open` or `closed`. |
| `state_reason` | TEXT | Nullable; `completed`, `not_planned` or null. |
| `author_id` | INTEGER | Nullable; FK to `mirror_user.id`. |
| `milestone_number` | INTEGER | Nullable; the thread's milestone number in its own repository. No foreign key: the milestone set is replaced wholesale on refresh. |
| `url` | TEXT | Not null, default `''`. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |
| `closed_at` | INTEGER | Nullable, Unix ms. |
| `status` | TEXT | Nullable; `backlog`, `todo`, `in-progress` or `in-review`. |
| `impact` | INTEGER | Nullable; `1` Severe, `2` Moderate or `3` Minor. |
| `urgency` | INTEGER | Nullable; `1` High, `2` Mid or `3` Low. |
| `priority` | TEXT | Nullable derived cache; `P1`, `P2` or `P3` (never a label). |
| `size` | TEXT | Nullable; `sm`, `md` or `lg`. |
| `blocked` | INTEGER | Not null, default `0`; 0/1 orthogonal flag. |
| `label_conflict` | INTEGER | Not null, default `0`; 0/1 ambiguous reserved-label timeline or a retired p-label that disagrees with the derived priority. |
| `is_epic` | INTEGER | Not null, default `0`; 0/1 cache of the orthogonal `epic` label. Parsed children live in the issue body, not here. |

Primary key: `(repo_id, number)`. Foreign keys:

- `repo_id` → `mirror_repo.id` on delete `CASCADE`.
- `author_id` → `mirror_user.id` on delete `SET NULL`.

Indexes:

- `uq_mirror_thread_external` unique on `(repo_id, external_id)`.
- `idx_mirror_thread_status_updated` on `(status, updated_at)`.
- `idx_mirror_thread_priority_updated` on `(priority, updated_at)`.
- `idx_mirror_thread_state` on `(state, state_reason)`.
- `idx_mirror_thread_repo_updated` on `(repo_id, updated_at)`.
- `idx_mirror_thread_milestone` on `(repo_id, milestone_number)`.

### `mirror_pull_request`

Development context for pull requests linked to mirrored issues (#28). A row is created only from GitHub's `closedByPullRequestsReferences` connection (closing keywords or manually linked PRs), never from the issue feed, so pull requests cannot leak into `mirror_thread`. The check rollup and review decision are cached so list rows and the issue detail can show failing checks without opening GitHub.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_repo.id`. |
| `number` | INTEGER | Not null; per-repo pull request number. |
| `external_id` | TEXT | Not null, default `''`; forge-native node id for batched refreshes. |
| `title` | TEXT | Not null, default `''`. |
| `state` | TEXT | Not null, default `'unknown'`; `open`, `closed`, `merged` or `unknown`. |
| `is_draft` | INTEGER | Not null, default `0`; 0/1. |
| `merged` | INTEGER | Not null, default `0`; 0/1; true for `merged` state. |
| `review_decision` | TEXT | Nullable; `approved`, `changes_requested`, `review_required`, `pending` or null. Derived from each reviewer's latest submitted review. |
| `approved_count` | INTEGER | Not null, default `0`; latest approvals. |
| `changes_requested_count` | INTEGER | Not null, default `0`; latest change requests. |
| `pending_review_count` | INTEGER | Not null, default `0`; outstanding review requests. |
| `checks_state` | TEXT | Nullable; `pending`, `success`, `failure` or `unknown` for the head commit. |
| `checks_total` | INTEGER | Nullable; total check runs and statuses. |
| `checks_failed` | INTEGER | Nullable; failing check count. |
| `checks_url` | TEXT | Nullable; the PR's checks page. |
| `url` | TEXT | Not null, default `''`. |
| `author_id` | INTEGER | Nullable; FK to `mirror_user.id`. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms; drives review re-reads. |
| `closed_at` | INTEGER | Nullable, Unix ms. |
| `merged_at` | INTEGER | Nullable, Unix ms. |

Primary key: `(repo_id, number)`. Foreign keys:

- `repo_id` → `mirror_repo.id` on delete `CASCADE`.
- `author_id` → `mirror_user.id` on delete `SET NULL`.

Indexes:

- `idx_mirror_pull_request_repo_updated` on `(repo_id, updated_at)`.
- `idx_mirror_pull_request_checks` on `(checks_state)`.

### `mirror_issue_pull_request`

The many-to-many link between a mirrored issue and its pull requests. `source` records how the link was surfaced: `closing` covers closing keywords and manually linked pull requests, while `cross-reference` is reserved for timeline-discovered references. Neither side carries a foreign key to the disposable thread/PR rows; the sync layer removes links with the issue and prunes pull requests no link references.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_repo.id`. |
| `issue_number` | INTEGER | Not null; the linked issue number. |
| `pr_number` | INTEGER | Not null; the linked pull request number. |
| `source` | TEXT | Not null, default `'closing'`; `closing` or `cross-reference`. |

Primary key: `(repo_id, issue_number, pr_number)`. Foreign keys: `repo_id` → `mirror_repo.id` on delete `CASCADE`. Indexes:

- `idx_mirror_issue_pr_issue` on `(repo_id, issue_number)`.
- `idx_mirror_issue_pr_pull` on `(repo_id, pr_number)`.

### `mirror_issue_relation`

GitHub-native parent/sub-issue and dependency edges (issue #34). Each row belongs to the source issue it was hydrated for and points at the related issue, which may be in another repository. The manual `blocked` flag on `mirror_thread` is unrelated: this table records what GitHub itself links, never a Funnel-local blocker. Neither side carries a foreign key to `mirror_thread`, because both are disposable and a target may not be mirrored yet. Replacing one query's kinds deletes only that source issue's rows for those kinds, so a failed sub-issue query never removes dependency rows and vice versa.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_repo.id` of the source issue. |
| `issue_number` | INTEGER | Not null; the source issue number. |
| `kind` | TEXT | Not null; `parent`, `child`, `blocked_by` or `blocking`. |
| `target_repo` | TEXT | Not null; `owner/name` of the related issue (may be another repository). |
| `target_number` | INTEGER | Not null; the related issue number. |
| `target_title` | TEXT | Not null, default `''`; empty when GitHub omitted it. |
| `target_state` | TEXT | Not null, default `'open'`; lower-case `open` or `closed`. |
| `target_url` | TEXT | Not null, default `''`. |

Primary key: `(repo_id, issue_number, kind, target_repo, target_number)`. Foreign keys: `repo_id` → `mirror_repo.id` on delete `CASCADE`. Indexes:

- `idx_mirror_issue_relation_issue` on `(repo_id, issue_number, kind)` for the Inspector read and per-kind replacement.
- `idx_mirror_issue_relation_target` on `(target_repo, target_number)` for reverse lookups.

Rows are replaced per source issue when a hydration query succeeds; a rejected query leaves the previous edge set intact. `deleteIssue` removes the deleted issue's rows as a source. Reverse rows owned by other issues are left to their own next hydration.

### `mirror_repo_label`

The per-repo label set, refreshed during sync.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_repo.id`. |
| `name` | TEXT | Not null. |
| `color` | TEXT | Not null, default `''`. |
| `description` | TEXT | Not null, default `''`. |

Primary key: `(repo_id, name)`. Foreign keys:

- `repo_id` → `mirror_repo.id` on delete `CASCADE`.

Indexes: the composite primary key only.

### `mirror_thread_label`

Thread-to-label assignments. There is no foreign key to the thread row; the sync layer deletes children before the parent.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; part of the thread identity. |
| `thread_number` | INTEGER | Not null; part of the thread identity. |
| `label_name` | TEXT | Not null. |

Primary key: `(repo_id, thread_number, label_name)`. Foreign keys: none. Indexes:

- `idx_mirror_thread_label_name` on `(label_name)`.

### `mirror_thread_assignee`

Current thread assignees. `user_id` references the user table; the repo/thread pair does not reference the thread row.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; part of the thread identity. |
| `thread_number` | INTEGER | Not null; part of the thread identity. |
| `user_id` | INTEGER | Not null; FK to `mirror_user.id`. |

Primary key: `(repo_id, thread_number, user_id)`. Foreign keys:

- `user_id` → `mirror_user.id` on delete `CASCADE`.

Indexes:

- `idx_mirror_thread_assignee_user` on `(user_id)`.

### `mirror_repo_assignee`

The per-repo collaborator set offered by the assignee picker. Distinct from `mirror_thread_assignee`, which records who is currently assigned.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_repo.id`. |
| `user_id` | INTEGER | Not null; FK to `mirror_user.id`. |

Primary key: `(repo_id, user_id)`. Foreign keys:

- `repo_id` → `mirror_repo.id` on delete `CASCADE`.
- `user_id` → `mirror_user.id` on delete `CASCADE`.

Indexes: the composite primary key only.

### `mirror_comment`

Mirrored thread comments. `(repo_id, external_id)` is the forge identity; the internal `id` is what the UI links to.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | INTEGER | Primary key; autoincrement. |
| `repo_id` | INTEGER | Not null; part of the thread identity. |
| `thread_number` | INTEGER | Not null; part of the thread identity. |
| `external_id` | TEXT | Not null; forge-native comment id. |
| `author_id` | INTEGER | Nullable; FK to `mirror_user.id`. |
| `body` | TEXT | Not null, default `''`. |
| `reactions` | TEXT | Nullable JSON `{ total, counts, viewerReacted }`. `counts` is keyed by GitHub reaction name; `viewerReacted` is always empty here because the mirror is shared, and the detail read merges the acting user's rows from `state_comment_reaction`. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys:

- `author_id` → `mirror_user.id` on delete `SET NULL`.

Indexes:

- `uq_mirror_comment_external` unique on `(repo_id, external_id)`.
- `idx_mirror_comment_thread` on `(repo_id, thread_number)`.

### `mirror_issue_event`

Normalized GitHub issue timeline history (#35). One row per imported timeline item, keyed by the forge node id so every hydration is an idempotent upsert. Comments are never stored here: `mirror_comment` already mirrors them, and the unified activity timeline must not duplicate a comment. Rows live only as long as their issue: `deleteIssue` removes them, but they are **not** pruned when the import window advances, so retained history is never erased just because an event aged out of the newest 50.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | INTEGER | Primary key; autoincrement. |
| `repo_id` | INTEGER | Not null; FK to `mirror_repo.id`. |
| `thread_number` | INTEGER | Not null; the issue number. |
| `external_id` | TEXT | Not null; forge-native timeline node id. |
| `kind` | TEXT | Not null; `label`, `assignment`, `state_change`, `referenced`, `mention` or `other`. |
| `action` | TEXT | Not null; e.g. `labelled`, `unlabelled`, `assigned`, `closed`, `reopened`, `renamed`. |
| `summary` | TEXT | Not null; one-line human-readable description. |
| `actor_id` | INTEGER | Nullable; FK to `mirror_user.id`. |
| `occurred_at` | INTEGER | Not null, Unix ms; the forge event time. |
| `detail` | TEXT | Nullable JSON payload (label, assignee login, reference source/title, previous/current title, milestone). |

Primary key: `id`. Foreign keys:

- `repo_id` → `mirror_repo.id` on delete `CASCADE`.
- `actor_id` → `mirror_user.id` on delete `SET NULL`.

Indexes:

- `uq_mirror_issue_event_external` unique on `(repo_id, external_id)`.
- `idx_mirror_issue_event_issue` on `(repo_id, thread_number, occurred_at)`.

Hydration requests `timelineItems(last: 50, since: $since)` in the same batched GraphQL query as the issue, where `$since` is the `sync.history_days` cutoff. A deeper timeline is intentionally not imported: the cap keeps one request per 100 issues bounded. Only label, assignment, close/reopen, cross-reference, reference, mention, rename and milestone events are normalized; unknown item types and every comment item are skipped.

### `mirror_thread_fts`

The FTS5 virtual table behind issue search. It is hand-written in the migration because Drizzle cannot model SQLite virtual tables; the mirror write path keeps one row per `(repo_id, number)` and deletes it when the issue is pruned.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `title` | TEXT | Indexed issue title. |
| `body` | TEXT | Indexed issue body. |
| `comments` | TEXT | Every mirrored comment body, joined with newlines. |
| `repo_id` | INTEGER | `UNINDEXED`; part of the mirror identity. |
| `number` | INTEGER | `UNINDEXED`; part of the mirror identity. |

Tokenizer: `porter unicode61`. Each `upsertIssues` write replaces the row, `deleteIssue`/`deleteIssuesNotIn` remove it, and direct demo-provider edits call `refreshIssueSearchIndex`. Queries use a safe quoted/prefix `MATCH` expression inside a row-value `IN` subquery, so free text is never interpreted as an FTS operator.

## Identity and keys

| Concept | Key | Notes |
| :--- | :--- | :--- |
| Mirrored thread | `(repo_id, number)` | Primary key; scopes a forge thread number to its repo. |
| Forge thread id | `external_id` | Unique per repo; the `databaseId` returned by GraphQL hydration, as text. |
| Mirrored repo | `(forge, instance, external_id)` | Forge-native id survives owner/name changes. |
| Mirrored repo slug | `(forge, instance, org, name)` | Unique index; the internal `id` is the FK target. |
| Mirrored milestone | `(repo_id, number)` | GitHub scopes milestones per repository. |
| Person | `(forge, instance, external_id)` | Internal `id` is the FK target; `login` is unique per instance but can change upstream. |
| Funnel account | `auth_user.id` | Text id; `email` is unique. |
| GitHub account link | `auth_account.accountId` | Forge account id stored as text for `providerId = 'github'`; compared with `mirror_user.external_id`. |
| Funnel-local issue state | `(org, name, issue_number)` | Work notes, attachments and issue watches; durable across mirror pruning. |
| Waiting state | `(repo, number)` | `state_issue_waiting`; local-only, keyed by `owner/name` + number so it survives mirror pruning. |
| Plan item | `(org, name, issue_number)` | One scheduled week per issue in `state_plan_item`; never written to GitHub and durable across mirror pruning. |
| Working hours (legacy) | `user_id` | Retained `state_work_hours` row from the removed daily planner. |
| Unavailable window (legacy) | `id` | Retained `state_unavailable_window` row from the removed daily planner. |
| Day block (legacy) | `id` | Retained `state_day_block` row from the removed daily planner. |
| Calendar feed (legacy) | `user_id` | Retained `state_calendar_feed` row; no current route serves it. |
| Issue event | `id` | UUID; the observed issue is `(org, name, issue_number)` and rows are ordered by `at`. |
| Issue delay | `id` | UUID; the delayed issue is `(org, name, issue_number)` and open rows have `ended_at IS NULL`. |
| Notification | `id` | UUID; scoped to one `auth_user.id` and de-duplicated by `dedupe_key`. |
| Instance setting | `key` | Dotted path; JSON-encoded `value`. |
| GitHub App | `id = 'default'` | Singleton row. |
| Webhook delivery | `id` | GitHub's `x-github-delivery` id; pruned after seven days. |

## Referential integrity

Foreign keys declared in the schema:

| Child column | Parent column | On delete |
| :--- | :--- | :--- |
| `auth_session.userId` | `auth_user.id` | `CASCADE` |
| `auth_account.userId` | `auth_user.id` | `CASCADE` |
| `state_work_hours.user_id` | `auth_user.id` | `CASCADE` |
| `state_unavailable_window.user_id` | `auth_user.id` | `CASCADE` |
| `state_day_block.user_id` | `auth_user.id` | `CASCADE` |
| `state_calendar_feed.user_id` | `auth_user.id` | `CASCADE` |
| `mirror_thread.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_thread.author_id` | `mirror_user.id` | `SET NULL` |
| `mirror_milestone.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_milestone.creator_id` | `mirror_user.id` | `SET NULL` |
| `mirror_repo_label.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_thread_assignee.user_id` | `mirror_user.id` | `CASCADE` |
| `mirror_repo_assignee.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_repo_assignee.user_id` | `mirror_user.id` | `CASCADE` |
| `mirror_pull_request.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_pull_request.author_id` | `mirror_user.id` | `SET NULL` |
| `mirror_issue_pull_request.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_issue_relation.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_issue_event.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_issue_event.actor_id` | `mirror_user.id` | `SET NULL` |
| `mirror_comment.author_id` | `mirror_user.id` | `SET NULL` |

The composite child tables `mirror_thread_label` and `mirror_thread_assignee`, the `repo_id`/`issue_number`/`pr_number` columns on `mirror_issue_pull_request`, the `repo_id`/`issue_number`/`target_repo`/`target_number` columns on `mirror_issue_relation`, and the `repo_id`/`thread_number` columns on `mirror_comment` and `mirror_issue_event`, carry no foreign key to `mirror_thread` or `mirror_pull_request`. `mirror_thread.milestone_number` also has no foreign key to `mirror_milestone`: the milestone set is replaced wholesale on refresh, and a thread may briefly reference a number that has not been mirrored yet. The sync layer therefore deletes labels, assignees, links, relations, comments and timeline events explicitly before deleting a thread row (`deleteIssue` in `src/lib/server/sync/mirror.ts`) and prunes pull requests that no link refers to. `state_work_note`, `state_attachment`, `state_notification`, `state_issue_watch`, `state_comment_reaction`, `state_plan_item`, `state_issue_event`, `state_issue_delay`, `state_issue_waiting`, `state_snooze`, `state_triage_event`, `state_work_hours`, `state_unavailable_window`, `state_day_block` and `state_calendar_feed` also carry no foreign key to the mirror: their author/uploader/recipient/actor identities are snapshots, and their issue identity is the durable `org/name` plus number. The four legacy day-planning tables reference `auth_user.id` directly with `ON DELETE CASCADE`; deleting an account removes any retained rows.

## Storage, pragmas and migrations

- Database file: `FUNNEL_DB`, default `./data/funnel.db`; the directory is created if needed. `:memory:` is supported.
- Driver: `bun:sqlite` through Drizzle (`drizzle-orm/bun-sqlite`); the server runs under Bun.
- Connection pragmas, set on the application connection and again by the migration runner:
  - `journal_mode = WAL`
  - `busy_timeout = 5000`
  - `foreign_keys = ON`
- One long-lived process owns the database file; Funnel is a single-instance deployment.
- Attachments are stored outside the database under `FUNNEL_UPLOAD_DIR` (default `./data/uploads`); only metadata is in `state_attachment`.
- Migrations are committed as `<timestamp>_<name>/migration.sql` directories under `drizzle/`. Drizzle records applied migrations in `__drizzle_migrations`.
- The packaged executable applies migrations on boot; a separate release step can run the same migrator. `/readyz` compares the applied count with the number of migration directories.
- Full-text search is provided by the `mirror_thread_fts` FTS5 virtual table. The migration that creates and backfills it is hand-written and additive; Drizzle snapshots intentionally omit the virtual table.
- Search ranking keeps the selected issue sort (priority by default) rather than ordering by FTS `bm25()`. Relevance ordering is a follow-up because #23's keyset cursor resumes on integer/text primary keys, not floating-point scores.

## Related

- [HTTP API](./http-api.md)
- [Routes and pages](./routes-and-pages.md)
- [Glossary](./glossary.md)
