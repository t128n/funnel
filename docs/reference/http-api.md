# HTTP API

Funnel exposes a public intake and health surface, a session-gated cockpit read surface, a per-user notification feed and watch API, GitHub-backed issue writes executed with the signed-in user's token, Funnel-local work-note, attachment, plan, epic-membership and delay endpoints, personal availability and day-plan routes under `/api/me/*`, and a public tokenized ICS calendar feed.

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

### Calendar feed

`GET /api/calendar/{token}.ics` serves one viewer's read-only ICS calendar. It requires no session: possession of the token is the capability, so the URL is a secret. Rotating or revoking the token makes the old URL return `404` immediately.

| Method | Path | Success | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/calendar/{token}.ics` | `200`, `text/calendar` | The viewer's issue blocks, buffer blocks and unavailable windows as an RFC 5545 calendar. |

The token is 32 random bytes encoded as base64url, 43 characters long; the trailing `.ics` is optional for lookup and is stripped before hashing. Only the SHA-256 hex hash and the first eight characters are stored, so the raw token is shown once when it is created and cannot be retrieved later.

| Header | Value |
| :--- | :--- |
| `Content-Type` | `text/calendar; charset=utf-8` |
| `Content-Disposition` | `inline; filename="funnel.ics"` |
| `Cache-Control` | `private, max-age=300` |
| `X-Robots-Tag` | `noindex, nofollow` |

The feed window is today − 7 days through today + 42 days in the viewer's timezone. Each event is `TRANSP:OPAQUE`, uses a UTC `DTSTART`/`DTEND`, and has a `UID` of `<table>-<id>@funnel`; issue events carry `FUNNEL-<number> <title>` as the summary and the issue URL as the description, buffer blocks are summarised `Buffer`, and unavailable windows use their label. Lines use CRLF and are folded at 75 octets. An unknown, rotated or malformed token returns `404`.

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
- The browser client subscribes to `sync`, `issues`, `intake`, `settings`, `notifications` and `planning`.
- The stream closes when the request is aborted.

Event payloads:

| Event name | Payload | Published when |
| :--- | :--- | :--- |
| `issues` | `{ "type": "issues", "repo": "owner/name", "numbers": [12, 13] }` | A sync cycle, post-write refresh, issue mutation, work-note change, or attachment change affects issues. |
| `intake` | `{ "type": "intake", "action": "created" \| "staged" \| "accepted" \| "dismissed" \| "duplicated", "id": "…", "repo"?: "owner/name", "number"?: 12 }` | A submission is staged or triaged. |
| `settings` | `{ "type": "settings" }` | An instance-settings save is applied. |
| `notifications` | `{ "type": "notifications" }` | At least one notification row was inserted. The signal carries no titles, people or user ids; each open tab fetches its own feed. |
| `planning` | `{ "type": "planning" }` | A plan item was scheduled, moved or cleared. The payload carries no issue identity; open planners reload the affected horizons. |
| `sync` | Generic `SyncEvent` shape | Part of the client-facing event vocabulary; no publisher in the current server modules emits this type. |

The heartbeat is an SSE comment, not a named event.

### Notifications

Every notification read is scoped to the signed-in user's `auth_user.id`. The routes never accept a user id from the client, and the shared `notifications` SSE event has no payload.

| Method | Path | Success | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications` | `200 { "items": NotificationItem[], "unreadCount": number }` | The viewer's feed, newest first. |
| `POST` | `/api/notifications` | `200 { "unreadCount": number }` | Mark one notification read, or all of them. |

`GET` query parameters:

| Parameter | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `limit` | positive integer | `50` | Clamped to at most `100`; a non-positive, non-integer or absent value uses the default. |
| `after` | positive integer | absent | Only rows with `createdAt` strictly greater than this Unix-ms value. |
| `unread` | `1` or `true` | off | Restrict the feed to rows whose `readAt` is `null`. |

`NotificationItem` is:

```json
{
  "id": "…",
  "kind": "assigned",
  "url": "/issues/orgA/core/7",
  "title": "Fix the widget",
  "body": "",
  "actorLogin": "alice",
  "actorAvatarUrl": "…",
  "readAt": null,
  "createdAt": 1760000000000
}
```

`kind` is one of `assigned`, `mentioned`, `comment`, `status`, `priority`, `state` or `new_intake`. Issue notifications link to `/issues/{owner}/{repo}/{number}`; new-intake notifications link to `/inbox/submission/{id}`. `readAt`, `actorLogin` and `actorAvatarUrl` may be `null`; `title` and `body` may be absent or empty.

The `POST` body is one of:

```json
{ "id": "…" }
```

```json
{ "all": true }
```

Marking an unknown or already-read id is a no-op; the response still reports the current unread count. Any other body returns `400 {"message":"Provide a notification id or { all: true }"}`; a non-JSON body returns `400 {"message":"Invalid notification update"}`.

### Issue watches

| Method | Path | Success | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/mirror/issues/{owner}/{repo}/{number}/watch` | `200 { "watching": boolean }` | Whether the viewer watches this issue. |
| `PUT` | `/api/mirror/issues/{owner}/{repo}/{number}/watch` | `200 { "watching": true }` | Start watching; idempotent. |
| `DELETE` | `/api/mirror/issues/{owner}/{repo}/{number}/watch` | `200 { "watching": false }` | Stop watching; idempotent. |

Watches are keyed by `org/name` plus issue number, so they survive mirror rebuilds. The repository must be mirrored and the issue number must be a positive integer; otherwise the route returns `404 {"message":"Repository owner/repo is not mirrored"}` or `400 {"message":"Invalid issue number"}`. Watching affects only the signed-in user and never notifies them about their own actions.

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
| `issue` | `IssueListItem`: `repoId`, `repo`, `number`, `title`, `state`, `stateReason`, `status`, `priority` (`P1`–`P3` or null), `impact` (`1`–`3` or null), `urgency` (`1`–`3` or null), `size`, `blocked`, `isEpic`, `labelConflict`, `createdAt`, `updatedAt`, `closedAt`, `author`, `assignees`, `labels`, `milestone`. |
| `body` | Raw Markdown body from the mirror. |
| `bodyHtml` | Sanitised HTML rendered from `body`. |
| `comments` | `RenderedComment[]`: `externalId`, `author`, `body`, `createdAt`, `bodyHtml`. |
| `workNotes` | `RenderedWorkNote[]`: `id`, `author`, `body`, `createdAt`, `updatedAt`, `bodyHtml`. |
| `attachments` | `AttachmentItem[]`: `id`, `filename`, `mimeType`, `sizeBytes`, `uploadedBy`, `createdAt`. |
| `repoLabels` | `{ "name": string, "color": string }[]`. |
| `assigneeOptions` | `UserRef[]`: `externalId`, `forge`, `instance`, `login`, `avatarUrl`. |
| `milestoneOptions` | `RepoMilestoneRef[]`: `repo`, `number`, `title`, `state`, `dueOn`. |
| `watching` | Boolean; whether the signed-in viewer watches this issue. |
| `time` | `IssueTime`: `actualMinutes`, `estimateMinutes`, `varianceMinutes`, `leadMinutes`, `cycleMinutes`, `delayMinutes`, `delayCount`. |
| `delays` | `DelayItem[]`, oldest first: `id`, `reason`, `startedAt`, `endedAt`, `note`, `source`. |
| `epic` | `EpicRef` (`repo`, `number`, `title`) when the issue is a child, otherwise `null`. |

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

These routes store Funnel-owned data in the durable `state_*` tables or edit Funnel-specific issue metadata. They require a session; only the epic children write and work-note publish use a GitHub token.

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

### Planning

Plan items are Funnel-local: they are never written to GitHub and are keyed by `org/name` plus issue number, so they survive mirror pruning and `clearMirror`. The issue's GitHub assignees, size and milestone remain the source of truth.

| Method | Path | Minimum role | Success |
| :--- | :--- | :--- | :--- |
| `PUT` | `/api/repos/{owner}/{repo}/issues/{number}/plan` | `write` | `200 { "item": PlanItem }` |
| `DELETE` | `/api/repos/{owner}/{repo}/issues/{number}/plan` | `write` | `200 { "cleared": true }` |

The `PUT` body is:

```json
{ "week_start": "2026-10-19" }
```

`week_start` is the Monday of the target ISO week in `YYYY-MM-DD` form (UTC) and is the only accepted field. Scheduling requires an open, sized, mirrored issue. The server checks the affected maintainers' lanes after applying the candidate and rejects the write when any would exceed `floor(weekly_minutes * weeks * allocation_percent / 100)`. Moving an issue to another week frees its old week before the check, and re-scheduling to the same week is a no-op.

`PlanItem` is `{ "org": string, "name": string, "number": number, "weekStart": "YYYY-MM-DD", "createdAt": number, "updatedAt": number }`.

| Status | Body |
| :--- | :--- |
| `200` | `{ "item": PlanItem }`; scheduling is idempotent per week. |
| `400` | `{ "message": "…", "issues"?: ["…"] }` for a malformed body or a week that is not a Monday, and for a closed, unestimated or unowned issue. |
| `404` | `{ "message": "…" }` when the repository or issue is not mirrored. |
| `409` | `{ "message": "…", "violations": [{ "login": string, "capMinutes": number, "committedMinutes": number, "excessMinutes": number }] }` when the candidate would exceed any affected maintainer's cap. Nothing is written. |

`DELETE` is idempotent: clearing an issue with no plan item still returns `200 { "cleared": true }`. Every successful `PUT` or `DELETE` publishes a `planning` SSE event.

### Availability, day plans and calendar feed

These self-service routes are personal: they require a session (`apiSession`) but never the `write` role, and each one reads or writes only the caller's rows. A `read` viewer can therefore manage their own working hours, day plan and calendar feed. Working hours resolve from the viewer's `state_work_hours` row, then from `planning.work_defaults`.

| Method | Path | Success | Purpose |
| :--- | :--- | :--- | :--- |
| `PUT` | `/api/me/availability` | `204`, no body | Replace the viewer's working hours and unavailable windows in one transaction. |
| `POST` | `/api/me/calendar-feed` | `200 { "token": string, "url": string, "hint": string, "createdAt": number }` | Create or rotate the viewer's ICS feed token. |
| `DELETE` | `/api/me/calendar-feed` | `204`, no body | Revoke the viewer's feed token; idempotent. |
| `PUT` | `/api/me/day-plan` | `200 { "blocks": DayBlock[] }` | Validate and replace the viewer's blocks for one local date. |
| `POST` | `/api/me/day-plan/auto` | `200 { "blocks": DayBlock[] }` | Auto-plan one date, persist the result and return it. |

`PUT /api/me/availability` takes:

```json
{
  "timezone": "Europe/Berlin",
  "start_minute": 540,
  "end_minute": 1020,
  "work_days": [1, 2, 3, 4, 5],
  "buffer_percent": 20,
  "windows": [
    { "label": "Lunch", "weekday": 1, "date": null, "start_minute": 720, "end_minute": 780 },
    { "label": "Dentist", "weekday": null, "date": "2026-11-03", "start_minute": 600, "end_minute": 660 }
  ]
}
```

Minutes are integers `0..1440` from local midnight, `start_minute < end_minute`, `work_days` is a non-empty set of ISO weekdays `1..7` and `buffer_percent` is `0..90`. Each window has a non-empty label of at most 60 characters and exactly one of `weekday` or `date`. The whole payload is replaced, so omitting a window deletes it.

`PUT /api/me/day-plan` takes:

```json
{
  "date": "2026-10-25",
  "blocks": [
    { "startMinute": 540, "minutes": 120, "kind": "issue", "org": "acme", "name": "core", "issueNumber": 12 },
    { "startMinute": 660, "minutes": 60, "kind": "buffer" }
  ]
}
```

Blocks are validated by the day model: they are sorted by start, must not overlap (`Blocks overlap at HH:MM`), must be at least 5 minutes, must end by `1440`, and are limited to 40 per day. An `issue` block needs a ref that is still open and mirrored; a `buffer` block must not carry one. Blocks outside the working window are accepted — a manual plan may overrun and the UI flags it. The write replaces every block for that date.

`DayBlock` is `{ "startMinute": number, "minutes": number, "kind": "issue" | "buffer", "org"?: string, "name"?: string, "issueNumber"?: number }`. The request and response use the day model's camelCase block fields, not the snake_case columns.

`POST /api/me/day-plan/auto` takes only `{ "date": "YYYY-MM-DD" }`. It builds from the viewer's candidates in priority order, spends at most `availableMinutes - bufferMinutes`, emits explicit buffer blocks for leftover space of 15 minutes or more, and persists the result. A non-work day yields an empty array.

The calendar feed response is the only place the raw feed token ever appears. `url` is `<origin>/api/calendar/<token>.ics`; `hint` is the token's first eight characters. Only the token's SHA-256 hash is stored in `state_calendar_feed.token_hash`, so a second `POST` rotates the row and the first URL stops working. There is no expiry: a link stays valid until it is regenerated or revoked.

Responses:

| Status | Body |
| :--- | :--- |
| `204` | Availability save and feed revoke. |
| `200` | `{ "token", "url", "hint", "createdAt" }` for feed creation; `{ "blocks": DayBlock[] }` for day-plan saves and auto-plan. |
| `400` | `{ "message": "…", "issues"?: ["…"] }` for a bad timezone, `start_minute >= end_minute`, both `weekday` and `date` (or neither), an out-of-bounds minute or buffer, an empty label, a malformed or impossible date, an overlapping or oversized block, or an unknown/closed issue ref. |
| `401` | No session. |

These personal mutations do not publish a `planning` SSE event; the day page re-reads its own data after a save.

### Epics and delays

Epic membership has two halves. The `epic` label marks the container and is an ordinary GitHub label edit; the ordered child list lives in the epic issue's trailing `<!-- funnel_metadata -->` envelope and is rewritten through the signed-in user's token. Delays are Funnel-local durable rows. Every route in this section requires `write`, and every successful write publishes an `issues` SSE event for the affected issue.

| Method | Path | Success | Purpose |
| :--- | :--- | :--- | :--- |
| `PUT` | `/api/repos/{owner}/{repo}/issues/{number}/epic` | `200` | Add or remove the `epic` label. |
| `PUT` | `/api/repos/{owner}/{repo}/issues/{number}/epic/children` | `200` | Replace the epic's ordered children list. |
| `POST` | `/api/repos/{owner}/{repo}/issues/{number}/delays` | `201` `DelayItem` | Record a manual delay. |
| `PATCH` | `/api/repos/{owner}/{repo}/issues/{number}/delays/{id}` | `200` `DelayItem` | Close or edit a manual delay. |
| `DELETE` | `/api/repos/{owner}/{repo}/issues/{number}/delays/{id}` | `204`, no body | Delete a manual delay. |

The epic label body uses the `is_epic` field:

```json
{ "is_epic": true }
```

`false` removes the label but leaves the body metadata untouched. The label is orthogonal to status, size and `blocked`.

The `children` body replaces the whole list in order:

```json
{ "children": ["orgA/core#12", "orgA/web#3"] }
```

Each entry must be `owner/name#number`. The endpoint rejects a malformed ref, a self reference or a nested epic with `400`, and a child already listed by another epic with `409`. An empty array clears the section. The relation is portable because it lives in the epic body and survives a mirror rebuild; there is no membership table. An issue should belong to one epic.

The delay create body is:

```json
{
  "reason": "review",
  "started_at": 1760000000000,
  "ended_at": null,
  "note": "Waiting for the security review"
}
```

| Field | Type | Required | Constraints |
| :--- | :--- | :--- | :--- |
| `reason` | string | yes | `dependency`, `info`, `review`, `external`, `capacity` or `other`. |
| `started_at` | integer (Unix ms) | no | Defaults to now. |
| `ended_at` | integer (Unix ms) or `null` | no | `null` or omitted leaves the delay open. |
| `note` | string | no | Defaults to `""`. |

`PATCH` accepts any of `ended_at`, `note` and `reason`; a request that carries none of them returns the delay unchanged with `200`. `DELETE` returns `404` for a missing row. Only `source = manual` rows can be edited or deleted; an automatic blocked row returns `403`, and a blocked delay is closed by unblocking the issue instead.

`DelayItem` is `{ "id": string, "reason": string, "startedAt": number, "endedAt": number | null, "note": string, "source": "blocked" | "manual" }`.

## Unknown API paths

`/api/*` paths that do not match a more specific route return a JSON 404 for every method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`):

```json
{ "message": "Not found" }
```

The response carries `Cache-Control: no-store`, so an API client that sends `Accept: text/html` still receives machine-readable JSON rather than the HTML error page.

## Status codes and caching

| Status | Typical cause |
| :--- | :--- |
| `200` | Successful read, update, label deletion, notification list or read-state update, work-note update or publish, plan schedule or clear, epic label or children update, delay update. |
| `201` | Intake staging, issue/comment creation, label addition, work-note creation, attachment upload, milestone creation, delay creation. |
| `204` | Intake preflight, work-note deletion, attachment deletion, manual delay deletion, availability save or calendar-feed revoke. |
| `304` | Passthrough read revalidated with `If-None-Match`. |
| `400` | Malformed JSON, schema validation failure, invalid issue number, unconfigured repository, empty patch, invalid availability or day-plan payload. |
| `401` | No cockpit session. |
| `403` | Session lacks the minimum role, or a manual-delay route targets an automatic blocked row. |
| `404` | Repo or issue not mirrored, unknown work note, attachment, delay or calendar-feed token, unknown API path. |
| `409` | A plan mutation would push a maintainer over capacity, an epic child is already in another epic, or demoting the last administrator. |
| `413` | Attachment exceeds the upload limit. |
| `502` | User token unavailable, or an upstream transport failure without a status. |
| `503` | Auth API while onboarding is incomplete, or readiness not achieved. |

Upstream GitHub 4xx statuses (for example `422`) keep that status. Write errors carry the upstream message; installation-resolution failures use the generic `Upstream error` message.

| Surface | `Cache-Control` |
| :--- | :--- |
| Intake `POST` | `no-store` |
| Intake `OPTIONS` | Not set; CORS headers only. |
| Mirror reads | Not set explicitly. |
| Notification feed and watch routes | Not set explicitly. |
| GitHub passthrough reads | `private, max-age=15, must-revalidate` |
| Attachment bytes | `private, max-age=0, must-revalidate` |
| Calendar feed | `private, max-age=300` |
| Event stream | `no-cache, no-transform` |
| Unknown API path | `no-store` |
| Health and readiness | Not set explicitly. |

## Related

- [Database schema](./database-schema.md)
- [Routes and pages](./routes-and-pages.md)
- [Feature flags](./feature-flags.md)
- [Glossary](./glossary.md)
- [OpenAPI contract](../../static/openapi.yml) — served at `/openapi.yml`
