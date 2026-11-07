# The intake lifecycle

Funnel lets anonymous submitters file work without touching GitHub, and holds every submission in a disposable staging queue until a triager explicitly turns it into a GitHub issue, drops it, or folds it into an existing one.

## Funnel-first intake

The default path by which work enters Funnel is not GitHub at all. A third-party page, a CLI, or a plain HTML form posts a title, a body, and an optional provenance string to Funnel; staging writes locally, not to GitHub. A triager may later accept it as an issue or duplicate it as a comment on an existing issue.

This is the front door precisely because the people who report problems are often not the people with GitHub access, and because an open intake endpoint must never be a way to create issues in repositories directly. Intake decouples *capture* from *filing*: anyone can capture, and a triager decides what reaches GitHub.

## Two ways in: the public API and the form

There are two entry points, sharing the same staging primitive and the same validation limits.

- **`POST /api/intake`** (`src/routes/api/intake/+server.ts`) accepts JSON `{ title, body?, source? }` from any origin. It validates against `intakeSchema` in `src/lib/server/intake/schema.ts` — title trimmed, non-empty and at most 256 characters (mirroring GitHub's own cap); body at most 65,536 characters; source optional and trimmed — and returns `201 {"id": "…"}`. Malformed JSON or a schema failure returns `400` with the validation messages. An `OPTIONS` handler answers the CORS preflight.
- **`/intake`** (`src/routes/intake/+page.server.ts`) is a JavaScript-free HTML form posting to a SvelteKit action. It applies the same title and body limits and returns a friendly `fail(400, …)` rather than a JSON error. A `GET` with `?title=…&body=…&source=…` renders a prefilled draft so external tools can deep-link into the composer; the page also self-hosts a compact `?d=base64url(deflate-raw(json))` deeplink. The `s=1` marker means the URL was written by the page itself and is not presented as a shareable link. Limits are clamped in `src/lib/intake-prefill.ts`.

The schema lives in its own module rather than in the route because SvelteKit's build-time export check rejects non-endpoint exports from `+server.ts`, and because the OpenAPI test compares it against `static/openapi.yml` so the two cannot drift. See the [HTTP API reference](../reference/http-api.md) for the exact field contract.

## Abuse controls

Because both entry points are anonymous, each one passes through the same three gates before a row is staged:

1. **Per-IP rate limit.** `src/lib/server/intake/rate-limit.ts` keeps fixed minute and hour counters keyed by client address. Both windows are incremented before the decision, so probing with malformed JSON, invalid fields or honeypot hits burns the same budget as real work. When a cap is exceeded, the API returns `429` with `Retry-After` set to the longer remaining wait; the form returns `fail(429, …)` with the wait and draft fields. The caps default to 10 per minute and 60 per hour; `0` disables a window.
2. **Honeypot.** The form carries a visually hidden `company_website` field that a real user never fills. The handlers read it from the raw form/JSON before schema validation, so it stays out of the published OpenAPI schema. A filled field produces the normal accepted-looking response but calls neither `createSubmission` nor `publish`.
3. **Validation and staging.** Only a request that clears both gates reaches the existing title/body checks and `createSubmission`.

Rejected requests log the client address and a reason, never the submitted title, body or source. The counters live in the adapter-node process, so a restart resets them and a multi-process deployment would give each process its own budget. The address comes from `getClientAddress()`; behind a reverse proxy the operator must configure adapter-node's trusted `ADDRESS_HEADER` (and `XFF_DEPTH`), because trusting a spoofable forwarded header would let a client choose its own bucket — or collapse everyone into the proxy's single bucket.

## The staging row

A submission lands in `state_intake_submission` with an opaque UUID `id`, the `title`, the `body` (empty string if omitted), a nullable `source`, and a unix-millisecond `createdAt`. `createSubmission` generates the id and writes the row synchronously; `listSubmissions` reads newest first, using `rowid` to break same-millisecond ties so ordering is deterministic. The id returned to the submitter is the only handle they receive, and it is never used as an authorisation token — the Inbox is a signed-in surface.

## The provenance footer

When a submission later becomes a GitHub issue or a comment, Funnel appends a plain-text footer so anyone reading GitHub can see where the text came from:

- `_Submitted via Funnel intake (source: …)_` when a source was given;
- `_Submitted via Funnel intake_` otherwise.

`composeBody` joins the submission body and the footer with a blank line, skipping empty segments, so a bodyless submission still carries the provenance. The submission row also remains in the local archive.

## The queue and archive

Every successful triage decision archives the staging row by setting `archived_at` and appends a `state_triage_event`. The pending queue excludes archived rows. Dismissal records a reason, duplication records its target, and the event history records the actor and decision.

The pending queue is a to-do list, not the decision log. Submissions appear ahead of untriaged issues in the Inbox stream; the archive and event history retain decided work locally.

## Triage decisions

The three decisions are transport-agnostic actions in `src/lib/server/intake/actions.ts`. Accept and duplicate take a user-token provider; dismissal does not need GitHub access.

### Accept

`acceptSubmission` resolves the target repository — the explicit selector wins, otherwise `intake.default_repo` — and rejects it unless it is one of the configured instance repositories, so triage can never target an unmapped repository. It then creates a GitHub issue with:

- the submission title;
- `composeBody(submission.body, submission.source)` — body plus provenance footer;
- labels: the default status `backlog` first (`DEFAULT_ACCEPT_STATUS`), then any labels the triager supplied, de-duplicated;
- any assignees the triager chose.

The default status is why an accepted issue lands *triaged*: it skips the Inbox's untriaged partition and appears directly on the board. Optional labels and assignees let a triager do the first bit of real triage in the same action.

### Dismiss

`dismissSubmission` archives the row with a required reason and touches nothing on GitHub. A missing or already archived row returns `404`. Undoing the latest dismissal restores the submission to the queue and appends an `undone` event; the original decision remains in history.

### Duplicate

`duplicateSubmission` folds a submission into an issue that already exists. The target must be present in the disposable mirror — `getRepoByOrgName` and `getIssue` are both checked — because the picker only ever offers mirrored issues. It then posts a comment whose body is the submission title in bold, the submission body, and the provenance footer, and clears the queue. The `htmlUrl` returned is the *comment's* URL.

## Pessimistic decisions and the crash window

Every decision that writes to GitHub is **pessimistic**: the staging row is archived only *after* GitHub confirms the write. `acceptSubmission` awaits the create, archives the row, records the decision, then publishes the event. `duplicateSubmission` does the same around the comment. On failure the row remains pending so the triager can retry.

The code names the cost of this ordering explicitly. A crash *between* GitHub's success and the local archive leaves the row staged. Retrying the accept could create a **second** GitHub issue. Archiving first would instead risk removing pending work on a GitHub failure.

## Realtime signalling

Each staging and triage step publishes an in-process SSE event on the bus in `src/lib/server/sync/events.ts`:

- `intake` / `staged` from the form action;
- `intake` / `created` from the public API;
- `intake` / `accepted` (with repo and issue number), `dismissed`, `duplicated`, and `undone` from the triage actions.

Open cockpits subscribe over `/api/events` and refetch the Inbox, so changes to the pending queue appear in other browser tabs without a reload.

## Why nothing reaches GitHub until triage

Holding submissions locally before filing them is a deliberate choke point:

- **No unsolicited GitHub writes.** An open intake endpoint cannot be used to create issues in a repository directly; the worst a spammer can do is populate a local queue.
- **One place to judge quality and duplication.** Title, body, provenance, and an existing-issue picker are all available before anything is filed.
- **Attribution is preserved separately from authorship.** On GitHub the issue is created with the triager's user token, so the triager is the author; the provenance footer carries where the text actually came from. This is a known trade-off — GitHub can never show the original submitter as the author — accepted in exchange for not needing reporter identities at all.
- **Repository choice is a triage decision.** Submitters do not choose a repository; the triager does, and only from the configured set.

## Roles and tokens

Intake divides cleanly along the public/private line:

- **Submitting is public.** `/intake` and `POST /api/intake` are exempt from the authenticated cockpit, alongside `/login`. No session and no role are required to stage a submission.
- **Triaging requires `write`.** The Inbox is inside the authenticated app, and the triage routes enforce the `write` role server-side (see `#lib/server/http/session.ts` and the [security model](security-model.md)). A `read` user can see the queue but cannot decide anything.
- **Writes run as the triager.** Accept and duplicate execute with the signed-in user's GitHub token, so GitHub enforces that user's real repository permissions natively, on top of Funnel's own configured-repository check. There is no privileged intake token.

## Related

- [The workflow model](workflow-model.md) — what happens once a submission becomes a triaged issue.
- [The security model](security-model.md) — why intake is public while triage is not.
- [HTTP API reference](../reference/http-api.md) — the intake request and response contract.
- [Triage intake](../how-to/use/triage-intake.md) — accept, dismiss, and duplicate from the cockpit.
- [Use the intake API](../how-to/integrate/intake-api.md) — calling `POST /api/intake` from a script or page.
- [Settings reference](../reference/settings.md) — `intake.default_repo`.
