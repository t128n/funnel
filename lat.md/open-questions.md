# Open questions and confidence

This page separates what the code and tests prove from what is inferred, and records product or documentation questions that need a maintainer's answer.

## How confidence is marked

Statements in this graph are grounded in current source, source comments, or tests. Where rationale is reconstructed from code shape or older prose, it is described as inferred rather than stated as fact.

Three levels are used:

- **Verified** — the implementation and tests agree, or a source comment states the rule directly.
- **Inferred** — the behavior is verified, but the reason is reconstructed from surrounding structure or documentation.
- **Unknown** — a product, retention, or compatibility decision that the code does not settle.

A paragraph's behavior is verified when it links to implementation or tests. Explanations of *why* without such a link are inferred, even when they appear in a section that also states verified behavior.

The `docs/` directory contains tutorials, how-to guides, explanations, and plans written at different times. Where it conflicts with current code and tests, this graph follows the code and tests and records the conflict below.

## Verified invariants

These rules are direct implementation facts, not marketing claims:

- One long-lived process owns one SQLite database; the mirror, auth tables, and durable state share the file.
- The read path is local; GitHub is authoritative for mirrored issues, labels, and workflow state.
- User-initiated writes use the signed-in user's token; sync and label housekeeping use the installation token.
- The mirror is disposable; durable Funnel state is keyed by `owner/name` plus issue number.
- Intake decisions archive the staging row and append an append-only triage event.
- Planning and actual time are Funnel-owned and never written to GitHub.
- Attention, waiting, snoozes, saved views, and notifications are local state.
- The deployment model forbids replicas because the scheduler, SSE bus, config cache, and auth instance are process-local.

## Inferred intent

The following explanations are plausible and consistent with the code, but should be confirmed if they matter for a decision:

- **Why one process** — the absence of a cache, queue, or broker is visible in the code. The rationale that a second cache would create a second consistency problem comes from the existing explanation docs, not from a maintainer decision recorded in source.
- **Why labels are the source of truth** — the behavior is verified. The trade-off discussion (portability and visibility versus eventual consistency and conflict repair) is documentation-derived.
- **Why the plan cap is hard only on mutations** — the code enforces the cap on schedule writes and tolerates later GitHub drift. The product reason for that asymmetry is inferred.

## Resolved decisions

These decisions were confirmed after review. They describe intent; the current implementation may still contain the old surface until cleanup lands.

### Intake archive is intended

The archive-and-undo flow is the intended policy. Older docs that describe a hard delete are stale and should be corrected or removed.

### Legacy detail URLs may be dropped

The `/board/...`, `/matrix/...`, and `/inbox/...` issue-detail redirects are compatibility scaffolding and may be removed. The dedicated `/issues/...` document remains the issue page.

### Retired day-planner tables should be cleaned up

There is no retention plan for the four unused tables. They should be removed in a cleanup rather than kept as permanent tombstones.

### Cycle settings are legacy only

`planning.cycle_weeks` and `planning.cycle_anchor` are not a supported concept. They may be deprecated and removed.

### Stale documentation may be removed

`docs/explanation/` and `docs/plans/` are not authoritative and may be removed. Code, tests, and this graph are the source of truth.

## Remaining questions

One policy question is still unanswered.

### Intake retention and purge policy

Archive is approved, but no retention or purge policy is defined for submitted title/body text that stays archived.

A future cleanup should decide whether archived submissions expire, are manually purged, or are kept indefinitely. This graph records the current archive behavior without asserting a retention period.

## Related

These docs hold the behavior and tests behind the questions.

- [[architecture]] — the process and authority model.
- [[intake]] — the archive and triage-event behavior under question.
- [[operations]] — retention, backup, and legacy-table implications.
- [[testing]] — the tests that settle the verified behavior.
