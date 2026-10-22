# Forge-agnostic model, slice B1 — schema, mirror and sync

## 1. Mirror schema

The disposable mirror becomes `mirror_repo`, `mirror_user`, `mirror_milestone`, `mirror_thread`, `mirror_repo_label`, `mirror_thread_label`, `mirror_thread_assignee`, `mirror_repo_assignee` and `mirror_comment`.

Every row carries `forge` and `instance`. Repositories and users have an internal integer `id` (the FK target) and a forge-native `external_id` text column, unique per `(forge, instance)`. Repositories also carry `url`. Threads carry `kind` (`issue`), `external_id`, `url` and the existing state/metadata columns. Milestones carry `external_id` and `url`. Comments carry an internal id and `external_id`, unique per `(repo_id, external_id)`.

Durable state keeps its GitHub-shaped names out of the schema: `state_work_note.author_external_id` / `author_forge` / `author_instance` and `state_attachment.uploaded_by_external_id` / `uploaded_by_forge` / `uploaded_by_instance`. Existing rows are copied with `author_github_id` cast to text and `github` as the forge.

A new migration drops the old `mirror_github_*` tables (the mirror is disposable and rebuilds on the next poll) and creates the new tables. It rebuilds the two durable tables with the new columns. The runtime reads only `*/migration.sql`, so the migration is hand-written; a snapshot is not required.

## 2. Mirror helpers

`sync/mirror.ts` exposes the same responsibilities with forge-neutral records:

- `RepoRow { id, externalId, forge, instance, org, name, url, etag, archived, degraded, lastPolledAt, lastReconciledAt }`
- `UserRecord { id, externalId, forge, instance, login, avatarUrl, url }`
- `CommentRecord { externalId, author, body, createdAt, updatedAt }`
- `IssueRecord { externalId, repoId, number, kind: "issue", title, body, state, stateReason, author, milestoneNumber, url, createdAt, updatedAt, closedAt, labels, assignees, comments }`
- `MilestoneRecord { number, externalId, title, description, state, dueOn, openIssues, closedIssues, creator, createdAt, updatedAt, closedAt, url }`

`upsertRepo` takes the external identity and returns the internal row. `upsertUser` upserts on `(forge, instance, external_id)` and returns the internal row; `upsertIssue` uses those internal ids for author, assignees and comment authors. `getRepo` and `getRepoCursor` take the internal `id`; `getRepoBySlug` takes `(forge, instance, org, name)`.

## 3. Sync stack

`hydrate.ts` builds `IssueRecord`s with `externalId: String(node.databaseId)`, `kind: "issue"` and the node's `url`; the GraphQL query selects `url`. `worker.ts` uses `repo.id` for mirror calls and builds the repo from `provider.repos.get` (`ref.externalId`, `forge`, `instance`, `url`). `conflicts.ts` and `reconcile.ts` use `repo.id`. The `ThreadRef`/`RepoRef` from `forges` are the only external identity; no raw GitHub ids leak into the mirror API.

## 4. Migration and compatibility

The migration runs before the app imports. A started instance with an old database loses its mirror and repopulates on the next poll; durable work notes and attachments survive with their author snapshots. No settings, auth, HTTP route or UI change is in this slice.
