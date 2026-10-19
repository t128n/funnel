# Database schema

Funnel stores all durable state, auth records and the disposable GitHub mirror in one SQLite database defined by `src/lib/server/db/schema.ts`.

## Conventions

### Table ownership

| Prefix | Owner | Durability |
| :--- | :--- | :--- |
| `state_*` | Funnel | Durable Funnel-owned state. Backed up; never truncated by sync. |
| `auth_*` | Better Auth | Durable authentication state. Columns use the library's camelCase names. |
| `mirror_github_*` | Funnel sync | Disposable GitHub cache, rebuildable by a re-sync and prunable by the history window or reconciliation. |

`state_intake_submission` is durable storage but an ephemeral queue by design: a triage decision hard-deletes the row.

### Timestamps

- `state_*` and `mirror_github_*` timestamps are integer Unix milliseconds, written with `Date.now()` or parsed from GitHub timestamps.
- `auth_*` columns declared with Drizzle `{ mode: "timestamp" }` are integer Unix seconds; values are `Date` objects at the adapter boundary.
- Boolean columns are integer `0`/`1`; the schema uses `{ mode: "boolean" }` for `auth_user.emailVerified` and `auth_user.banned`, and plain integers for mirror flags such as `archived`, `degraded`, `blocked` and `label_conflict`.

### Identity conventions

- A mirrored issue is identified by `(repo_id, number)`.
- A GitHub issue also has a globally unique `github_id`: the numeric database id. REST polling yields `node_id`s for hydration, and the GraphQL response's `databaseId` populates this column.
- Repositories are identified by the numeric `github_id`, which survives renames; `(org, name)` is unique.
- Funnel-local work notes and attachments are keyed by `org/name` plus issue number, not by the disposable mirror issue row, so they survive mirror pruning and re-sync.
- People are keyed by numeric GitHub id (`mirror_github_user.github_id`). Better Auth users use a separate text id; `auth_account.accountId` stores the numeric GitHub id as a string for the `github` provider.

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

### `state_setting`

Normalised instance settings as JSON-encoded key/value rows. Lists (`repos`, `projects`) are stored under one key as a JSON array.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `key` | TEXT | Primary key; dotted path such as `sync.history_days`. |
| `value` | TEXT | Not null; JSON-encoded value. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `key`. Foreign keys: none. Indexes: none.

Known keys: `repos`, `projects`, `intake.default_repo`, `sync.history_days`, `sync.poll_interval_active_seconds`, `sync.poll_interval_idle_seconds`, `board.done_days`, `board.wip_limits`, `session.idle_days`. `github.url` and `github.api_url` are environment values and are not stored here. Missing, unparseable or invalid rows fall back to per-key defaults.

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
| `author_github_id` | INTEGER | Nullable; snapshot, not a foreign key. |
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
| `uploaded_by_github_id` | INTEGER | Nullable; snapshot, not a foreign key. |
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

### `mirror_github_repo`

Configured repositories that sync has seen. The numeric GitHub id survives renames.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `github_id` | INTEGER | Primary key. |
| `org` | TEXT | Not null. |
| `name` | TEXT | Not null. |
| `etag` | TEXT | Nullable; persisted REST ETag for conditional polling. |
| `archived` | INTEGER | Not null, default `0`; 0/1. |
| `degraded` | INTEGER | Not null, default `0`; 0/1. |
| `last_polled_at` | INTEGER | Nullable, Unix ms. |
| `last_reconciled_at` | INTEGER | Nullable, Unix ms. |

Primary key: `github_id`. Foreign keys: none. Indexes:

- `uq_mirror_github_repo_org_name` unique on `(org, name)`.

### `mirror_github_user`

Mirrored GitHub people: authors, assignees and collaborators.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `github_id` | INTEGER | Primary key; numeric GitHub account id. |
| `login` | TEXT | Not null, unique. |
| `avatar_url` | TEXT | Not null, default `''`. |

Primary key: `github_id`. Foreign keys: none. Indexes: unique constraint on `login`.

### `mirror_github_issue`

The issue cache. `status`, `priority`, `size` and `blocked` are derived caches of the reserved-label groups, recomputed at sync time. Done/Cancelled derive from `(state, state_reason)`.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_github_repo.github_id`. |
| `number` | INTEGER | Not null; per-repo issue number. |
| `github_id` | INTEGER | Not null, unique; global node database id. |
| `title` | TEXT | Not null. |
| `body` | TEXT | Not null, default `''`. |
| `state` | TEXT | Not null; `open` or `closed`. |
| `state_reason` | TEXT | Nullable; `completed`, `not_planned` or null. |
| `author_id` | INTEGER | Nullable; FK to `mirror_github_user.github_id`. |
| `milestone_name` | TEXT | Nullable. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |
| `closed_at` | INTEGER | Nullable, Unix ms. |
| `status` | TEXT | Nullable; `backlog`, `todo`, `in-progress` or `in-review`. |
| `priority` | TEXT | Nullable; `p1`, `p2` or `p3`. |
| `size` | TEXT | Nullable; `sm`, `md` or `lg`. |
| `blocked` | INTEGER | Not null, default `0`; 0/1 orthogonal flag. |
| `label_conflict` | INTEGER | Not null, default `0`; 0/1 ambiguous reserved-label timeline. |

Primary key: `(repo_id, number)`. Foreign keys:

- `repo_id` → `mirror_github_repo.github_id` on delete `CASCADE`.
- `author_id` → `mirror_github_user.github_id` on delete `SET NULL`.

Indexes:

- `idx_mirror_github_issue_status_updated` on `(status, updated_at)`.
- `idx_mirror_github_issue_priority_updated` on `(priority, updated_at)`.
- `idx_mirror_github_issue_state` on `(state, state_reason)`.
- `idx_mirror_github_issue_repo_updated` on `(repo_id, updated_at)`.
- Unique constraint on `github_id`.

### `mirror_github_repo_label`

The per-repo label set, refreshed during sync.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_github_repo.github_id`. |
| `name` | TEXT | Not null. |
| `color` | TEXT | Not null, default `''`. |
| `description` | TEXT | Not null, default `''`. |

Primary key: `(repo_id, name)`. Foreign keys:

- `repo_id` → `mirror_github_repo.github_id` on delete `CASCADE`.

Indexes: the composite primary key only.

### `mirror_github_issue_label`

Issue-to-label assignments. There is no foreign key to the issue row; the sync layer deletes children before the parent.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; part of the issue identity. |
| `issue_number` | INTEGER | Not null; part of the issue identity. |
| `label_name` | TEXT | Not null. |

Primary key: `(repo_id, issue_number, label_name)`. Foreign keys: none. Indexes:

- `idx_mirror_github_issue_label_name` on `(label_name)`.

### `mirror_github_issue_assignee`

Current issue assignees. `user_id` references the user table; the repo/issue pair does not reference the issue row.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; part of the issue identity. |
| `issue_number` | INTEGER | Not null; part of the issue identity. |
| `user_id` | INTEGER | Not null; FK to `mirror_github_user.github_id`. |

Primary key: `(repo_id, issue_number, user_id)`. Foreign keys:

- `user_id` → `mirror_github_user.github_id` on delete `CASCADE`.

Indexes:

- `idx_mirror_github_issue_assignee_user` on `(user_id)`.

### `mirror_github_repo_assignee`

The per-repo collaborator set offered by the assignee picker. Distinct from `mirror_github_issue_assignee`, which records who is currently assigned.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `repo_id` | INTEGER | Not null; FK to `mirror_github_repo.github_id`. |
| `user_id` | INTEGER | Not null; FK to `mirror_github_user.github_id`. |

Primary key: `(repo_id, user_id)`. Foreign keys:

- `repo_id` → `mirror_github_repo.github_id` on delete `CASCADE`.
- `user_id` → `mirror_github_user.github_id` on delete `CASCADE`.

Indexes: the composite primary key only.

### `mirror_github_comment`

Mirrored issue comments. The comment's global GitHub id is the primary key; `repo_id`/`issue_number` are not foreign keys.

| Column | Type | Constraints / notes |
| :--- | :--- | :--- |
| `github_id` | INTEGER | Primary key. |
| `repo_id` | INTEGER | Not null; part of the issue identity. |
| `issue_number` | INTEGER | Not null; part of the issue identity. |
| `author_id` | INTEGER | Nullable; FK to `mirror_github_user.github_id`. |
| `body` | TEXT | Not null, default `''`. |
| `created_at` | INTEGER | Not null, Unix ms. |
| `updated_at` | INTEGER | Not null, Unix ms. |

Primary key: `github_id`. Foreign keys:

- `author_id` → `mirror_github_user.github_id` on delete `SET NULL`.

Indexes:

- `idx_mirror_github_comment_issue` on `(repo_id, issue_number)`.

## Identity and keys

| Concept | Key | Notes |
| :--- | :--- | :--- |
| Mirrored issue | `(repo_id, number)` | Primary key; scopes a GitHub issue number to its repo. |
| GitHub issue node | `github_id` | Unique across the mirror; the numeric `databaseId` returned by GraphQL hydration. |
| Mirrored repo | `github_id` | Numeric id survives owner/name changes. |
| Mirrored repo slug | `(org, name)` | Unique index. |
| Person | `github_id` | `login` is unique but can change upstream. |
| Funnel account | `auth_user.id` | Text id; `email` is unique. |
| GitHub account link | `auth_account.accountId` | Numeric GitHub id stored as text for `providerId = 'github'`. |
| Funnel-local issue state | `(org, name, issue_number)` | Work notes and attachments; durable across mirror pruning. |
| Instance setting | `key` | Dotted path; JSON-encoded `value`. |
| GitHub App | `id = 'default'` | Singleton row. |

## Referential integrity

Foreign keys declared in the schema:

| Child column | Parent column | On delete |
| :--- | :--- | :--- |
| `auth_session.userId` | `auth_user.id` | `CASCADE` |
| `auth_account.userId` | `auth_user.id` | `CASCADE` |
| `mirror_github_issue.repo_id` | `mirror_github_repo.github_id` | `CASCADE` |
| `mirror_github_issue.author_id` | `mirror_github_user.github_id` | `SET NULL` |
| `mirror_github_repo_label.repo_id` | `mirror_github_repo.github_id` | `CASCADE` |
| `mirror_github_issue_assignee.user_id` | `mirror_github_user.github_id` | `CASCADE` |
| `mirror_github_repo_assignee.repo_id` | `mirror_github_repo.github_id` | `CASCADE` |
| `mirror_github_repo_assignee.user_id` | `mirror_github_user.github_id` | `CASCADE` |
| `mirror_github_comment.author_id` | `mirror_github_user.github_id` | `SET NULL` |

The composite child tables `mirror_github_issue_label` and `mirror_github_issue_assignee`, and the `repo_id`/`issue_number` columns on `mirror_github_comment`, carry no foreign key to `mirror_github_issue`. The sync layer therefore deletes labels, assignees and comments explicitly before deleting an issue row (`deleteIssue` in `src/lib/server/sync/mirror.ts`). `state_work_note` and `state_attachment` also carry no foreign key to the mirror: their author/uploader ids are snapshots, and their issue identity is the durable `org/name` plus number.

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
