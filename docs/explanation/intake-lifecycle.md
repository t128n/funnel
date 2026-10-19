# The intake lifecycle

Funnel lets anonymous submitters file work without touching GitHub, and holds every submission in a disposable staging queue until a triager explicitly turns it into a GitHub issue, drops it, or folds it into an existing one.

## Funnel-first intake

The default path by which work enters Funnel is not GitHub at all. A third-party page, a CLI, or a plain HTML form posts a title, a body, and an optional provenance string to Funnel; the submission is staged locally and **nothing reaches GitHub until a triager accepts it**. The endpoint's own comment states the invariant: "Nothing reaches GitHub until a triager accepts it."

This is the front door precisely because the people who report problems are often not the people with GitHub access, and because an open intake endpoint must never be a way to create issues in repositories directly. Intake decouples *capture* from *filing*: anyone can capture, and a triager decides what becomes durable.

## Two ways in: the public API and the form

There are two entry points, sharing the same staging primitive and the same validation limits.

- **`POST /api/intake`** (`src/routes/api/intake/+server.ts`) accepts JSON `{ title, body?, source? }` from any origin. It validates against `intakeSchema` in `src/lib/server/intake/schema.ts` — title trimmed, non-empty and at most 256 characters (mirroring GitHub's own cap); body at most 65,536 characters; source optional and trimmed — and returns `201 {"id": "…"}`. Malformed JSON or a schema failure returns `400` with the validation messages. An `OPTIONS` handler answers the CORS preflight.
- **`/intake`** (`src/routes/intake/+page.server.ts`) is a JavaScript-free HTML form posting to a SvelteKit action. It applies the same title and body limits and returns a friendly `fail(400, …)` rather than a JSON error. A `GET` with `?title=…&body=…&source=…` renders a prefilled draft so external tools can deep-link into the composer; the page also self-hosts a compact `?d=base64url(deflate-raw(json))` deeplink. The `s=1` marker means the URL was written by the page itself and is not presented as a shareable link. Limits are clamped in `src/lib/intake-prefill.ts`.

The schema lives in its own module rather than in the route because SvelteKit's build-time export check rejects non-endpoint exports from `+server.ts`, and because the OpenAPI test compares it against `static/openapi.yml` so the two cannot drift. See the [HTTP API reference](../reference/http-api.md) for the exact field contract.

## The staging row

A submission lands in `state_intake_submission` with an opaque UUID `id`, the `title`, the `body` (empty string if omitted), a nullable `source`, and a unix-millisecond `createdAt`. `createSubmission` generates the id and writes the row synchronously; `listSubmissions` reads newest first, using `rowid` to break same-millisecond ties so ordering is deterministic. The id returned to the submitter is the only handle they receive, and it is never used as an authorisation token — the Inbox is a signed-in surface.

## The provenance footer

When a submission later becomes a GitHub issue or a comment, Funnel appends a plain-text footer so anyone reading GitHub can see where the text came from:

- `_Submitted via Funnel intake (source: …)_` when a source was given;
- `_Submitted via Funnel intake_` otherwise.

`composeBody` joins the submission body and the footer with a blank line, skipping empty segments, so a bodyless submission still carries the provenance. This is the one trace of the intake origin that survives onto GitHub; the staging row itself does not.

## The queue is ephemeral

Every triage decision **hard-deletes** the staging row. There is no status column, no soft delete, no archive. `deleteSubmission` issues a real `DELETE` and reports whether a row changed. The module comment is unambiguous: "every decision hard-deletes the row. There is no trash bin and no archive; durable history lives on GitHub once accepted."

The queue is therefore best understood as a to-do list, not a log. It exists only to hold undecided work; the moment a decision is made, the row is gone. Submissions are also the first thing in the Inbox stream, ahead of untriaged issues, because they have no repository, status, or assignee to filter on and so are always shown (only the search term narrows them).

## Triage decisions

The three decisions are pure, transport-agnostic actions in `src/lib/server/intake/actions.ts`. Each takes a user-token Octokit, keeping session and token handling out of the module so the logic is directly unit-testable.

### Accept

`acceptSubmission` resolves the target repository — the explicit selector wins, otherwise `intake.default_repo` — and rejects it unless it is one of the configured instance repositories, so triage can never target an unmapped repository. It then creates a GitHub issue with:

- the submission title;
- `composeBody(submission.body, submission.source)` — body plus provenance footer;
- labels: the default status `backlog` first (`DEFAULT_ACCEPT_STATUS`), then any labels the triager supplied, de-duplicated;
- any assignees the triager chose.

The default status is why an accepted issue lands *triaged*: it skips the Inbox's untriaged partition and appears directly on the board. Optional labels and assignees let a triager do the first bit of real triage in the same action.

### Dismiss

`dismissSubmission` deletes the row and touches nothing on GitHub. A missing row returns `404`. Dismissal is the only decision with no upstream effect, and the only way a submission vanishes without a trace.

### Duplicate

`duplicateSubmission` folds a submission into an issue that already exists. The target must be present in the disposable mirror — `getRepoByOrgName` and `getIssue` are both checked — because the picker only ever offers mirrored issues. It then posts a comment whose body is the submission title in bold, the submission body, and the provenance footer, and clears the queue. The `htmlUrl` returned is the *comment's* URL.

## Pessimistic decisions and the crash window

Every decision that writes to GitHub is **pessimistic**: the staging row is deleted only *after* GitHub confirms the write. `acceptSubmission` awaits the create, deletes the row, then publishes the event. `duplicateSubmission` does the same around the comment. On any failure the row is retained so the triager can retry, and the failure is returned as `{ ok: false, status, message }` via the shared `Outcome` envelope rather than thrown.

The code names the cost of this ordering explicitly. A crash *between* GitHub's success and the local delete leaves the row staged. Retrying the accept would create a **second** GitHub issue; the comment calls this out and says the pessimistic model accepts it. The alternative — deleting first, then writing — would risk losing submitted text on a GitHub failure, which is worse for a human-submitted report than a rare duplicate. Funnel chooses to prefer a possible duplicate over a possible loss, and flags the trade so an operator reading the log understands it.

## Realtime signalling

Each staging and triage step publishes an in-process SSE event on the bus in `src/lib/server/sync/events.ts`:

- `intake` / `staged` from the form action;
- `intake` / `created` from the public API;
- `intake` / `accepted` (with repo and issue number), `dismissed`, and `duplicated` from the triage actions.

Open cockpits subscribe over `/api/events` and refetch the Inbox, so a submission appears and disappears in other browser tabs without a reload. The transient queue and the SSE-driven refresh are two halves of the same idea: the queue is not durable, and the UI learns about it in real time rather than polling.

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

## No archive, no trash

Dismissed and duplicated submissions are gone; there is no archive to browse, no "recently deleted", and no way to recover the text from Funnel. Once accepted, the durable copy lives on GitHub and Funnel simply mirrors it back. This keeps the staging table tiny and the privacy story simple — the queue holds only undecided work — at the cost of unrecoverable dismissal, which is exactly the point: a dismiss is a decision, not a soft hide.

## Related

- [The workflow model](workflow-model.md) — what happens once a submission becomes a triaged issue.
- [The security model](security-model.md) — why intake is public while triage is not.
- [HTTP API reference](../reference/http-api.md) — the intake request and response contract.
- [Triage intake](../how-to/use/triage-intake.md) — accept, dismiss, and duplicate from the cockpit.
- [Use the intake API](../how-to/integrate/intake-api.md) — calling `POST /api/intake` from a script or page.
- [Settings reference](../reference/settings.md) — `intake.default_repo`.
