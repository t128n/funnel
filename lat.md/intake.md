# Intake

Funnel accepts work from people who do not have GitHub access, stages it locally, and creates GitHub issues only after a triager decides. The queue is the front door; GitHub is the durable destination.

## Two public entry points

`POST /api/intake` accepts anonymous JSON (`title`, optional `body`, optional `source`) from any origin. The route handler in [[src/routes/api/intake/+server.ts#POST]] validates with [[src/lib/server/intake/schema.ts#intakeSchema]], stages the row, and returns `201 {"id": "..."}`. An `OPTIONS` handler answers browser preflights.

`/intake` is a JavaScript-free HTML form backed by a SvelteKit action. It applies the same title and body limits, preserves the draft on a validation or rate-limit failure, and returns a friendly error instead of JSON. A `GET` with `?title=…&body=…&source=…` renders a prefilled draft, including the page's compact `?d=base64url(deflate-raw(json))` deeplink. The shared clamping and deeplink rules live in [[src/lib/intake-prefill.ts]].

The schema is its own module because SvelteKit rejects extra exports from `+server.ts`, and because the OpenAPI test compares it against `static/openapi.yml`.

## Abuse controls

Both entry points run the same gates before a row is staged.

**Per-IP rate limit.** [[src/lib/server/intake/rate-limit.ts#checkIntakeRateLimit]] keeps fixed minute and hour counters. Both windows are incremented before the decision, so malformed JSON, invalid fields, and honeypot hits burn the same budget as real work. Exceeding either returns `429` with `Retry-After` set to the longer remaining wait. The defaults are 10 per minute and 60 per hour; `0` disables a window.

**Honeypot.** The form carries a visually hidden `company_website` field. A filled field returns an accepted-looking response but calls neither `createSubmission` nor `publish`. The JSON route reads it from the raw body so it never appears in the published OpenAPI schema.

Rejected requests log the client address and a reason, never the submitted title, body, or source. The counters are in-process, so a restart resets them and a multi-process deployment would give each process its own budget. Behind a proxy the operator must configure adapter-node's trusted address header; otherwise every request shares one bucket.

## Staging and the archive

[[src/lib/server/intake/staging.ts#createSubmission]] writes an opaque UUID row to `state_intake_submission` with the title, body, optional source, and a unix-millisecond timestamp. The id returned to the submitter is a handle, never an authorisation token.

A triage decision **archives** the row instead of deleting it. The pending queue reads only rows with `archived_at IS NULL`; the archive keeps the dismiss reason and duplicate target so a decision remains inspectable. [[src/lib/server/intake/staging.ts#restoreSubmission]] reverses a dismissal, and `deleteSubmission` exists only for explicit cleanup and tests.

The durable history is `state_triage_event`, an append-only log. Every decision, including an undo, appends a row through [[src/lib/server/intake/events.ts#recordTriageEvent]]. History is keyed by submission id rather than a foreign key so it survives the archived row.

## Triage decisions

The decisions are transport-agnostic functions in [[src/lib/server/intake/actions.ts]] so session and token handling stay in the route layer.

**Accept.** [[src/lib/server/intake/actions.ts#acceptSubmission]] resolves the target repository (explicit selector first, otherwise `intake.default_repo`), rejects anything not configured, creates the issue, and then archives the row. The default status is [[src/lib/server/intake/actions.ts#DEFAULT_ACCEPT_STATUS]] (`backlog`), so an accepted issue lands triaged. The triager may also choose a status, a size, extra labels, and assignees.

**Dismiss.** [[src/lib/server/intake/actions.ts#dismissSubmission]] requires a free-text reason of at most 500 characters, archives the row, and touches nothing on GitHub. This is the only decision that needs no GitHub token.

**Duplicate.** [[src/lib/server/intake/actions.ts#duplicateSubmission]] requires the target to be present in the mirror, posts the submission as a comment with a provenance footer, then archives the row. The returned URL is the comment's URL.

**Undo.** [[src/lib/server/intake/actions.ts#undoTriageEvent]] only accepts the latest dismissal for a submission. It appends an `undone` event and restores the row; it never edits or deletes history.

## Pessimistic writes and provenance

Accept and duplicate write to GitHub before archiving the staging row.

Accepted content carries a plain-text footer, `_Submitted via Funnel intake (source: …)_` or `_Submitted via Funnel intake_`. The triager's user token creates the issue, so GitHub shows the triager as author; the footer is the only surviving trace of the original submitter.

## Realtime signals

Every intake step publishes an in-process event so open cockpits refresh the queue.

## Tests

Staging, decisions, and undo are covered by [[src/lib/server/intake/staging.test.ts]], [[src/lib/server/intake/actions.test.ts]], and [[tests/inbox-triage-route.test.ts]]; the public endpoints by [[tests/intake.test.ts]].

## Related

These docs cover the states and surfaces a submission moves through.

- [[workflow]] — what happens once a submission becomes a triaged issue.
- [[attention]] — how the new-intake notification is produced.
- [[security]] — why submission is public while triage requires `write`.
