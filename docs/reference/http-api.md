# HTTP API

Funnel exposes a public intake and health surface, a session-gated cockpit read surface, GitHub-backed issue writes executed with the signed-in user's token, and Funnel-local work-note and attachment endpoints.

## Conventions

- Responses are JSON unless a route explicitly streams bytes, HTML or SSE.
- Errors are JSON objects with a `message` field. Validation failures also carry an `issues` array of human-readable strings.
- Session-gated routes require a valid Better Auth session. The minimum role is enforced by `apiRole` in `src/lib/server/http/session.ts`:
  - no session → `401 {"message":"Not authenticated"}`
  - insufficient role → `403 {"message":"Forbidden"}`
- GitHub-backed writes additionally require a resolvable GitHub user access token. If the token cannot be minted, the route returns `502` with the error message.
- Roles are ranked `read < write < admin`.
- Request bodies are read with `request.json()`; malformed JSON yields `400 {"message":"Request body must be valid JSON"}` on routes that parse a body.
- The intake contract is published at [`static/openapi.yml`](../../static/openapi.yml), served at `/openapi.yml`.

## Public surface

These routes do not require a session. `/healthz` and `/readyz` are exempt from the first-run gate; `/api/intake` is reachable once an App exists and is redirected to `/onboarding` on an un-onboarded instance, like every other non-exempt path.

### Intake

| Method | Path | Success | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/intake` | `201 { "id": "<uuid>" }` | Stage an anonymous submission for triage. |
| `OPTIONS` | `/api/intake` | `204`, no body | CORS preflight for browser submitters. |

Request body:

| Field | Type | Required | Constraints |
| :--- | :--- | :--- | :--- |
| `title` | string | yes | Trimmed, non-empty, at most 256 characters. |
| `body` | string | no | At most 65,536 characters. Defaults to `""`. |
| `source` | string | no | Free-form provenance label, trimmed. Defaults to `""`. |

Unknown properties are ignored. A submission is stored in `state_intake_submission`; nothing is created on GitHub until a triager accepts it.

Responses:

| Status | Body |
| :--- | :--- |
| `201` | `{ "id": "<uuid>" }` — an opaque handle for the staged row. |
| `400` | `{ "message": "Request body must be valid JSON" }` for a non-JSON body. |
| `400` | `{ "message": "Invalid intake submission", "issues": ["…"] }` for schema failures. |

Every `POST` response carries `Cache-Control: no-store` and the open CORS headers:

| Header | Value |
| :--- | :--- |
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Methods` | `POST, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type` |
| `Access-Control-Max-Age` | `86400` |

The preflight response carries the same CORS headers but no `Cache-Control`. The open CORS policy carries no credentials; the documented access boundary is the instance's network segmentation.

### Health and readiness

| Method | Path | Success | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/healthz` | `200 { "status": "ok", "service": "funnel" }` | Liveness. Touches no database or network state. |
| `GET` | `/readyz` | `200 { "status": "ready", "applied": <n>, "expected": <n> }` | Readiness. Checks the database and migration count. |

`/readyz` returns `503` while the instance cannot serve traffic:

| Condition | Status | Body |
| :--- | :--- | :--- |
| Migrations table missing or database unreachable | `503` | `{ "status": "starting", "reason": "database not migrated" }` |
| Committed migrations are not all applied | `503` | `{ "status": "starting", "reason": "migrations pending", "applied": <n>, "expected": <m> }` |

`expected` is `null` when the migrations folder cannot be located; readiness then depends only on the migrations table being present. Both health routes are ungated.

## Authentication surface

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET`, `POST` | `/api/auth/*` | Better Auth catch-all: sign-in, OAuth callback (`/api/auth/callback/github`), session, sign-out, and admin endpoints. |

The route delegates the request to the Better Auth handler. While the instance has no GitHub App configured, it returns `503` with the plain-text body `Onboarding incomplete: no GitHub App configured`. The `/api/auth/*` path is exempt from the first-run redirect so this response can be reached. Admin plugin endpoints under `/api/auth/admin/*` require the `admin` role; new accounts default to `read`.

## Cockpit read surface

All routes in this section require a signed-in `read` session.

### Event stream

`GET /api/events` opens a Server-Sent Events stream. The response has:

| Header | Value |
| :--- | :--- |
| `Content-Type` | `text/event-stream` |
| `Cache-Control` | `no-cache, no-transform` |
| `Connection` | `keep-alive` |
| `X-Accel-Buffering` | `no` |

Stream behaviour:

- The first frames are `retry: 5000` and a `: connected` comment.
- A heartbeat comment `: ping` is sent every 12,000 ms (`HEARTBEAT_MS`).
- Each published `SyncEvent` is sent as `event: <type>` followed by `data: <JSON>`.
- The browser client subscribes to `sync`, `issues`, `intake` and `settings`.
- The stream closes when the request is aborted.

Event payloads:

| Event name | Payload | Published when |
| :--- | :--- | :--- |
| `issues` | `{ "type": "issues", "repo": "owner/name", "numbers": [12, 13] }` | A sync cycle, post-write refresh, issue mutation, work-note change, or attachment change affects issues. |
| `intake` | `{ "type": "intake", "action": "created" \| "staged" \| "accepted" \| "dismissed" \| "duplicated", "id": "…", "repo"?: "owner/name", "number"?: 12 }` | A submission is staged or triaged. |
| `settings` | `{ "type": "settings" }` | An instance-settings save is applied. |
| `sync` | Generic `SyncEvent` shape | Part of the client-facing event vocabulary; no publisher in the current server modules emits this type. |

The heartbeat is an SSE comment, not a named event.

### Mirror reads

These routes read the disposable local mirror and make no GitHub request.

| Method | Path | Success | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/mirror/issues/{owner}/{repo}` | `200` array of `IssueOption` | List mirrored issues for the intake duplicate picker. |
| `GET` | `/api/mirror/issues/{owner}/{repo}/{number}` | `200` `RenderedIssueDetail` | Full Inspector payload for one mirrored issue. |

List options:

- `limit` query parameter, default `100`, clamped to `1..200`; a non-finite value falls back to `100`.
- A repo that is not mirrored returns `404 {"message":"Repository owner/repo is not mirrored"}`.
- Each item is `{ "number": number, "title": string, "state": string }`.

Detail responses:

| Status | Body |
| :--- | :--- |
| `200` | `RenderedIssueDetail` (see below). |
| `400` | `{ "message": "Invalid issue number" }` when the number is not a positive integer. |
| `404` | `{ "message": "Repository owner/repo is not mirrored" }` |
| `404` | `{ "message": "Issue owner/repo#12 is not mirrored" }` |

`RenderedIssueDetail` fields:

| Field | Shape |
| :--- | :--- |
| `issue` | `IssueListItem`: `repoId`, `repo`, `number`, `title`, `state`, `stateReason`, `status`, `priority` (`P1`–`P3` or null), `impact` (`1`–`3` or null), `urgency` (`1`–`3` or null), `size`, `blocked`, `labelConflict`, `createdAt`, `updatedAt`, `closedAt`, `author`, `assignees`, `labels`, `milestone`. |
| `body` | Raw Markdown body from the mirror. |
| `bodyHtml` | Sanitised HTML rendered from `body`. |
| `comments` | `RenderedComment[]`: `externalId`, `author`, `body`, `createdAt`, `bodyHtml`. |
| `workNotes` | `RenderedWorkNote[]`: `id`, `author`, `body`, `createdAt`, `updatedAt`, `bodyHtml`. |
| `attachments` | `AttachmentItem[]`: `id`, `filename`, `mimeType`, `sizeBytes`, `uploadedBy`, `createdAt`. |
| `repoLabels` | `{ "name": string, "color": string }[]`. |
| `assigneeOptions` | `UserRef[]`: `externalId`, `forge`, `instance`, `login`, `avatarUrl`. |
| `milestoneOptions` | `RepoMilestoneRef[]`: `repo`, `number`, `title`, `state`, `dueOn`. |

`author` and `uploadedBy` are `UserRef` objects or `null` — as are `comments[].author` and `workNotes[].author` when the mirror cannot resolve the person — while entries in `assignees` are always `UserRef` objects. Markdown is rendered with the server's sanitised renderer at the delivery boundary; the raw body is retained for the Inspector's editors.

## Issue write surface

These routes are GitHub-backed. Reads use the GitHub App installation token; writes use the signed-in user's OAuth token. Every route requires `read` or `write` as stated. Writes also require the target repo to be one of the instance's configured repositories; otherwise the mutation layer returns `400 {"message":"Repository owner/repo is not configured"}`.

### List and read issues

| Method | Path | Minimum role | Execution token | Success |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/repos/{owner}/{repo}/issues` | `read` | Installation | `200` GitHub issue array, or `304` |
| `POST` | `/api/repos/{owner}/{repo}/issues` | `write` | User | `201 { "number": 12, "htmlUrl": "…" }` |
| `GET` | `/api/repos/{owner}/{repo}/issues/{number}` | `read` | Installation | `200` GitHub issue object, or `304` |
| `PATCH` | `/api/repos/{owner}/{repo}/issues/{number}` | `write` | User | `200 { "number": 12, "htmlUrl": "…" }` |

The list route forwards these query parameters and ignores unknown ones: `state`, `labels`, `assignee`, `creator`, `mentioned`, `milestone`, `since`, `sort`, `direction`, `per_page`, `page`. Entries carrying a `pull_request` key are removed from the response. The single-issue route forwards no query parameters.

Passthrough responses are GitHub's own JSON bodies. Successful responses carry `Cache-Control: private, max-age=15, must-revalidate` and may carry `ETag`, `Last-Modified`, `X-Funnel-Fetched-At`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`; rate-limit errors may also carry `Retry-After`. A client `If-None-Match` can produce `304` with no body. Pagination `Link` headers are rewritten from the upstream API URL to `/api/...`.

An unknown repo or an App that is not installed yields `404` with:

```json
{ "message": "Not synced, open on GitHub", "html_url": "https://github.com/owner/repo" }
```

If installation resolution fails with a non-404 status, the route returns `{"message":"Upstream error"}` with that status. Failures from the passthrough request itself are forwarded with GitHub's status and body; a transport failure without a status becomes `502 {"message":"Bad gateway"}`.

### Create an issue

`POST /api/repos/{owner}/{repo}/issues`

| Field | Type | Required | Constraints |
| :--- | :--- | :--- | :--- |
| `title` | string | yes | Trimmed, non-empty, at most 256 characters. |
| `body` | string | no | At most 65,536 characters. Defaults to `""`. |
| `labels` | string[] | no | Trimmed, non-empty names. Defaults to `[]`. |
| `assignees` | string[] | no | Trimmed, non-empty logins. Defaults to `[]`. |
| `status` | `backlog` \| `todo` \| `in-progress` \| `in-review` | no | Convenience reserved-label shortcut. |
| `impact` | `sev` \| `mod` \| `min` | no | Convenience reserved-label shortcut. |
| `urgency` | `high` \| `mid` \| `low` | no | Convenience reserved-label shortcut. |
| `size` | `sm` \| `md` \| `lg` | no | Convenience reserved-label shortcut. |

Reserved labels are normalised to at most one per active group before the GitHub create: status, impact, urgency and size are each single-valued. Retired `p1`–`p3` labels are stripped from outbound sets. Success returns `201` with `{ number, htmlUrl }`.

### Read or update an issue

`PATCH /api/repos/{owner}/{repo}/issues/{number}`

| Field | Type | Notes |
| :--- | :--- | :--- |
| `title` | string | Trimmed, non-empty, at most 256 characters. |
| `body` | string | At most 65,536 characters. |
| `assignees` | string[] | Trimmed, non-empty logins. |
| `state` | `open` \| `closed` | |
| `state_reason` | `completed` \| `not_planned` \| `null` | |
| `status` | status value or `null` | `null` clears the status group. |
| `impact` | `sev` \| `mod` \| `min` or `null` | `null` clears the impact group. |
| `urgency` | `high` \| `mid` \| `low` or `null` | `null` clears the urgency group. |
| `size` | size value or `null` | `null` clears the size group. |
| `blocked` | boolean | Adds or removes the reserved `blocked` flag. |
| `milestone` | positive integer or `null` | Attaches a repository milestone by number, or clears it. Omitting the field leaves it untouched. |

A patch with no fields present returns `400 {"message":"No changes provided"}`. An invalid status, impact, urgency or size value returns `400 {"message":"Invalid status value: …"}`. Field edits and state changes use GitHub's issue update; reserved-label edits read the authoritative label set from GitHub and replace it so at most one label per active group remains. Priority is derived from impact × urgency and is not writable. Success returns `200` with `{ number, htmlUrl }`.

## Comments

| Method | Path | Minimum role | Execution token | Success |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/repos/{owner}/{repo}/issues/{number}/comments` | `read` | Installation | `200` GitHub comment array, or `304` |
| `POST` | `/api/repos/{owner}/{repo}/issues/{number}/comments` | `write` | User | `201 { "id": 123, "htmlUrl": "…" }` |

The `GET` forwards `since`, `per_page` and `page`; unknown query parameters are ignored. The 404 fallback points at the issue's GitHub URL.

The `POST` body is:

```json
{ "body": "Comment text" }
```

`body` is trimmed and limited to 65,536 characters; an empty value is rejected.

### Labels

| Method | Path | Minimum role | Execution token | Success |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/repos/{owner}/{repo}/labels` | `read` | Installation | `200` GitHub label array, or `304` |
| `GET` | `/api/repos/{owner}/{repo}/labels/{name}` | `read` | Installation | `200` GitHub label object, or `304` |
| `POST` | `/api/repos/{owner}/{repo}/issues/{number}/labels` | `write` | User | `201 { "labels": ["bug"] }` |
| `DELETE` | `/api/repos/{owner}/{repo}/issues/{number}/labels/{name}` | `write` | User | `200 { "name": "bug" }` |

The repo label list forwards `per_page` and `page` only and has no `html_url` fallback. The single-label read has no query parameters and uses an `html_url` fallback pointing at the corresponding GitHub label page.

The add body is `{ "labels": ["bug"] }`; an empty array is rejected. Reserved additions are group-aware: adding `todo` removes the other status labels. The response echoes the requested label names, not the complete issue label set. The delete path removes exactly one label.

### Milestones

| Method | Path | Minimum role | Execution token | Success |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/repos/{owner}/{repo}/milestones` | `write` | User | `201 { "number": 3, "htmlUrl": "…" }` |

The body is:

```json
{
  "title": "v1.0",
  "description": "First public release",
  "dueOn": "2026-12-31"
}
```

| Field | Type | Required | Constraints |
| :--- | :--- | :--- | :--- |
| `title` | string | yes | Trimmed, non-empty, at most 256 characters. |
| `description` | string | no | At most 65,536 characters. Defaults to `""`. |
| `dueOn` | string or `null` | no | `YYYY-MM-DD`, or `null`/omitted for no due date. |

The repository must be configured in Funnel. GitHub scopes a milestone to one repository, so this endpoint creates it only in the named repository. Funnel schedules a milestone refresh after a successful create so the Inspector picker lists the new milestone immediately. There is no Funnel endpoint to rename, close, reopen or delete a milestone; manage those on GitHub.

To attach or clear a milestone on an issue, use the `milestone` field on the issue `PATCH` described above. The mirror detail payload exposes the repository's available milestones in `milestoneOptions`.

### Users

`GET /api/users/{username}` requires `read` and uses the App-JWT client because there is no repository context. It mirrors GitHub's `GET /users/{username}` and returns the upstream user object, or `304`. A 404 fallback points at the GitHub profile. Cache namespace is `0`.

## Funnel-local surface

These routes store data in Funnel's durable `state_*` tables. They require a session and do not use a GitHub token except for publishing a work note.

### Work notes

| Method | Path | Minimum role | Success |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/repos/{owner}/{repo}/issues/{number}/work-notes` | `write` | `201` `WorkNoteItem` |
| `PATCH` | `/api/repos/{owner}/{repo}/issues/{number}/work-notes/{id}` | `write` | `200` `WorkNoteItem` |
| `DELETE` | `/api/repos/{owner}/{repo}/issues/{number}/work-notes/{id}` | `write` | `204`, no body |
| `POST` | `/api/repos/{owner}/{repo}/issues/{number}/work-notes/{id}/publish` | `write` | `200 { "id": "…" }` |

`WorkNoteItem` is `{ "id": string, "author": UserRef | null, "body": string, "createdAt": number, "updatedAt": number }`. The author is resolved from the session (mirrored GitHub identity first, Better Auth profile as fallback), not from the request body.

Work notes are listed inside the mirror detail payload's `workNotes` field; there is no standalone work-note list endpoint. The write routes above provide create, update, delete and publish.

Create and update bodies are `{ "body": "…" }`. The body is trimmed, non-empty and at most 65,536 characters. The create route requires the repo to be mirrored and a positive integer issue number. Missing notes return `404 {"message":"Work note not found"}`.

Publishing posts the note body as a GitHub issue comment with the signed-in user's token, then deletes the local note and schedules an issue refresh. It is a one-way move. If the comment fails, the note remains.

### Attachments

| Method | Path | Minimum role | Success |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/repos/{owner}/{repo}/issues/{number}/attachments` | `write` | `201` `AttachmentItem` |
| `GET` | `/api/attachments/{id}` | `read` | `200` file bytes |
| `DELETE` | `/api/attachments/{id}` | `write` | `204`, no body |

Upload uses `multipart/form-data` with a single `file` field:

- A non-multipart body returns `400 {"message":"Request body must be multipart/form-data"}`.
- A missing `file` field returns `400` with ``{"message":"A `file` field is required"}``.
- An empty file returns `400 {"message":"File is empty"}`.
- A file larger than `FUNNEL_UPLOAD_MAX_BYTES` returns `413 {"message":"File exceeds the <limit> byte limit"}`. The default limit is 10 MiB (`10485760` bytes). A deployment whose `BODY_SIZE_LIMIT` is smaller rejects the request before Funnel sees it.
- A non-integer or non-positive issue number returns `400 {"message":"Invalid issue number"}`; a repo that is not mirrored returns `404 {"message":"Repository owner/repo is not mirrored"}`.

`AttachmentItem` is `{ "id": string, "filename": string, "mimeType": string, "sizeBytes": number, "uploadedBy": UserRef | null, "createdAt": number }`. The list of attachments for an issue is returned in the `attachments` field of `/api/mirror/issues/{owner}/{repo}/{number}`; there is no standalone attachment-list route. Bytes are written under `FUNNEL_UPLOAD_DIR`; the on-disk path is server-generated as `<yyyy>/<mm>/<uuid>`. The client filename is sanitised for display and the download disposition.

The byte response carries:

| Header | Value |
| :--- | :--- |
| `Content-Type` | The stored MIME type, or `application/octet-stream`. |
| `Content-Length` | The stored byte count. |
| `Content-Disposition` | `attachment; filename="…"` plus a UTF-8 `filename*`. |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `private, max-age=0, must-revalidate` |

A missing row or a row whose file has disappeared returns `404 {"message":"Attachment not found"}`.

## Unknown API paths

`/api/*` paths that do not match a more specific route return a JSON 404 for every method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`):

```json
{ "message": "Not found" }
```

The response carries `Cache-Control: no-store`, so an API client that sends `Accept: text/html` still receives machine-readable JSON rather than the HTML error page.

## Status codes and caching

| Status | Typical cause |
| :--- | :--- |
| `200` | Successful read, update, label deletion, work-note update or publish. |
| `201` | Intake staging, issue/comment creation, label addition, work-note creation, attachment upload, milestone creation. |
| `204` | Intake preflight, work-note deletion, attachment deletion. |
| `304` | Passthrough read revalidated with `If-None-Match`. |
| `400` | Malformed JSON, schema validation failure, invalid issue number, unconfigured repository, empty patch. |
| `401` | No cockpit session. |
| `403` | Session lacks the minimum role. |
| `404` | Repo or issue not mirrored, unknown work note or attachment, unknown API path. |
| `413` | Attachment exceeds the upload limit. |
| `502` | User token unavailable, or an upstream transport failure without a status. |
| `503` | Auth API while onboarding is incomplete, or readiness not achieved. |

Upstream GitHub 4xx statuses (for example `422`) keep that status. Write errors carry the upstream message; installation-resolution failures use the generic `Upstream error` message.

| Surface | `Cache-Control` |
| :--- | :--- |
| Intake `POST` | `no-store` |
| Intake `OPTIONS` | Not set; CORS headers only. |
| Mirror reads | Not set explicitly. |
| GitHub passthrough reads | `private, max-age=15, must-revalidate` |
| Attachment bytes | `private, max-age=0, must-revalidate` |
| Event stream | `no-cache, no-transform` |
| Unknown API path | `no-store` |
| Health and readiness | Not set explicitly. |

## Related

- [Database schema](./database-schema.md)
- [Routes and pages](./routes-and-pages.md)
- [Feature flags](./feature-flags.md)
- [Glossary](./glossary.md)
- [OpenAPI contract](../../static/openapi.yml) — served at `/openapi.yml`
