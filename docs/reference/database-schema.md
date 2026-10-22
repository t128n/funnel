# Database schema

Funnel stores all durable state, auth records and the disposable GitHub mirror in one SQLite database defined by `src/lib/server/db/schema.ts`.

## Conventions

### Table ownership

| Prefix | Owner | Durability |
| :--- | :--- | :--- |
| `state_*` | Funnel | Durable Funnel-owned state. Backed up; never truncated by sync. |
| `auth_*` | Better Auth | Durable authentication state. Columns use the library's camelCase names. |
| `mirror_*` | Funnel sync | Disposable forge cache, rebuildable by a re-sync and prunable by the history window or reconciliation. |

`state_intake_submission` is durable storage but an ephemeral queue by design: a triage decision hard-deletes the row.

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
- People are keyed by `(forge, instance, external_id)` and referenced internally by `mirror_user.id`. Better Auth users use a separate text id; `auth_account.accountId` stores the GitHub account id as a string for the `github` provider.

## State tables

### `state_intake_submission`

Staged public intake submissions, newest first in the Inbox. A triage decision deletes the row.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `title` | TEXT | Not null. |
| `body` | TEXT | Not null, default `''`. |
| `source` | TEXT | Nullable provenance label. |
| `created_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys: none. Indexes: none; listing orders by `created_at DESC, rowid DESC` to break same-millisecond ties.

### `state_notification`

Per-user notification rows. Each row snapshots everything the notification center renders, including the title, body and actor, so reading the feed never depends on the disposable mirror. Rows are durable; read state is tracked and there is no automatic expiry.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `id` | TEXT | Primary key; UUID. |
| `user_id` | TEXT | Not null; the recipient's `auth_user.id`, not a foreign key. |
| `kind` | TEXT | Not null; `assigned`, `mentioned`, `comment`, `status`, `priority`, `state` or `new_intake`. |
| `dedupe_key` | TEXT | Not null; names the GitHub event or intake submission that produced the row, for example `status:org/name#7:<userId>:<event>`. Unique across all users. |
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

Known keys: `repos`, `projects`, `intake.default_repo`, `sync.history_days`, `sync.poll_interval_active_seconds`, `sync.poll_interval_idle_seconds`, `board.done_days`, `board.wip_limits`, `session.idle_days`, `notifications.enabled`, `notifications.native`, `notifications.new_intake`. `github.url` and `github.api_url` are environment values and are not stored here. Missing, unparseable or invalid rows fall back to per-key defaults.

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

The thread cache (currently issues only). `status`, `impact`, `urgency`, `size` and `blocked` are derived caches of the active reserved-label groups, recomputed at sync time; `priority` is the derived P1–P3 cache. Done/Cancelled derive from `(state, state_reason)`.

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
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `id`. Foreign keys:

- `author_id` → `mirror_user.id` on delete `SET NULL`.

Indexes:

- `uq_mirror_comment_external` unique on `(repo_id, external_id)`.
- `idx_mirror_comment_thread` on `(repo_id, thread_number)`.

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
| Notification | `id` | UUID; scoped to one `auth_user.id` and de-duplicated by `dedupe_key`. |
| Instance setting | `key` | Dotted path; JSON-encoded `value`. |
| GitHub App | `id = 'default'` | Singleton row. |

## Referential integrity

Foreign keys declared in the schema:

| Child column | Parent column | On delete |
| :--- | :--- | :--- |
| `auth_session.userId` | `auth_user.id` | `CASCADE` |
| `auth_account.userId` | `auth_user.id` | `CASCADE` |
| `mirror_thread.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_thread.author_id` | `mirror_user.id` | `SET NULL` |
| `mirror_milestone.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_milestone.creator_id` | `mirror_user.id` | `SET NULL` |
| `mirror_repo_label.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_thread_assignee.user_id` | `mirror_user.id` | `CASCADE` |
| `mirror_repo_assignee.repo_id` | `mirror_repo.id` | `CASCADE` |
| `mirror_repo_assignee.user_id` | `mirror_user.id` | `CASCADE` |
| `mirror_comment.author_id` | `mirror_user.id` | `SET NULL` |

The composite child tables `mirror_thread_label` and `mirror_thread_assignee`, and the `repo_id`/`thread_number` columns on `mirror_comment`, carry no foreign key to `mirror_thread`. `mirror_thread.milestone_number` also has no foreign key to `mirror_milestone`: the milestone set is replaced wholesale on refresh, and a thread may briefly reference a number that has not been mirrored yet. The sync layer therefore deletes labels, assignees and comments explicitly before deleting a thread row (`deleteIssue` in `src/lib/server/sync/mirror.ts`). `state_work_note`, `state_attachment`, `state_notification` and `state_issue_watch` also carry no foreign key to the mirror: their author/uploader/recipient/actor identities are snapshots, and their issue identity is the durable `org/name` plus number.

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
- Full-text search is deferred. Text search currently uses SQL `LIKE` over issue titles, bodies and comments rather than an FTS5 index.

## Related

- [HTTP API](./http-api.md)
- [Routes and pages](./routes-and-pages.md)
- [Glossary](./glossary.md)
