# The workflow model

Funnel keeps its workflow state on GitHub itself, in a small reserved label vocabulary, and treats its own database as a disposable projection of those labels.

## Labels are the source of truth

Funnel does not own the workflow. An issue's stage, priority, size, and blocked flag are ordinary GitHub labels, and GitHub remains authoritative for all of them. The local SQLite tables (`mirror_github_issue.status`, `.priority`, `.size`, `.blocked`) are a *cache*, computed when a mirrored issue is hydrated and recomputed when it is synced again. The schema comment says as much: `status`/`priority`/`size` are "derived caches of the reserved-label groups computed at sync time".

This is a deliberate inversion of the usual tracker design. Rather than Funnel holding state and publishing a read-only mirror to GitHub, Funnel reads its state *from* GitHub labels that anyone with repository access can see and change. Two consequences follow immediately: the workflow is visible and portable outside Funnel, and Funnel has to be robust to labels changing underneath it — including labels added by humans, other bots, or automation that has never heard of Funnel. That robustness is what most of the machinery described below exists to provide.

## The reserved vocabulary

The vocabulary lives in the dependency-free `src/lib/labels.ts` so that the cockpit UI and the server share one definition, and `src/lib/server/github/labels.ts` re-exports it. `CANONICAL_LABELS` fixes eleven names in four groups:

- **status** — `backlog`, `todo`, `in-progress`, `in-review`
- **priority** — `p1`, `p2`, `p3`
- **size** — `sm`, `md`, `lg`
- **flags** — `blocked`

Each carries a canonical colour and description. Only these names are ever created or patched by Funnel. Every other label on a repository — `bug`, `frontend`, a monorepo domain tag — is preserved untouched. Projects, the optional group-by dimension, are configured separately as arbitrary labels mapped to display names (`ProjectConfig` in `src/lib/server/config.ts`); they are not part of the reserved vocabulary.

## Absence carries meaning

The reserved vocabulary is smaller than it looks because a missing label is itself a value:

- no status label means **untriaged** — the issue belongs in the Inbox;
- no priority label means **no priority** (it sorts last);
- no size label means **unestimated**;
- no `blocked` label means **not flagged**.

The absence semantics are load-bearing rather than incidental. `isUntriaged` in `src/lib/labels.ts` defines Inbox membership as `state === "open" && status === null`, and the SQL in `inbox()` mirrors it exactly as `state = "open" AND status IS NULL`. The comment on both deliberately asks future editors to keep the two definitions in step, because the client uses the client-side version to move an issue out of the queue optimistically while the server uses the SQL version. The filter layer gives absence a first-class name too: the `none` sentinel selects issues missing a label for a dimension.

One subtlety: because absence means "untriaged", adding *any* status label is what performs triage. There is no separate triaged flag.

## One label per group

Status, priority, and size are each meant to hold at most one label. Funnel enforces this in three places:

- **On write**, `normalizeReserved` and `withReserved` in `src/lib/server/issues/mutations.ts` keep the first label of each reserved group and swap out its siblings. Editing status reads the issue's authoritative label set from GitHub, replaces the status member, and `PUT`s the whole set back in one request.
- **On sync**, `deriveMetadata` in `src/lib/server/sync/conflicts.ts` groups an issue's labels and, when a group carries several, records the group in `conflicts`; `hydrateAndStore` turns a non-empty `conflicts` list into `label_conflict` on the row.
- **On repair**, `resolveIssueConflict` reconciles an issue whose group is over-full by inspecting the timeline (below).

The vocabulary comment calls a generated issue's group over-full state a "conflict", and the mirror stores a `label_conflict` boolean so the UI can warn about it.

## Why `blocked` is orthogonal

`blocked` is a **flag**, not a stage. It lives in its own group and is deliberately not a board column: `BOARD_COLUMNS` lists the four open stages plus `Done`, and the comment on `statusBoard` states that "Blocking is an orthogonal flag on the card, not a lane, so it never appears here". An issue keeps its stage (`in-progress`, say) and carries `blocked` alongside it; removing the flag restores its unblocked state without a separate transition.

This matters because being blocked is information *about* work that is otherwise in flight. Modelling it as a fifth status would force an issue to choose between "in progress" and "blocked", destroying the fact that work is assigned and underway but waiting on something. The orthogonality also gives the Attention view something meaningful to query: `attentionIssues()` selects open issues whose `blocked` column is set *and* whose body carries a structured re-check date in the trailing `<!-- funnel_metadata -->` envelope. That envelope (`src/lib/funnel-metadata.ts`) is a machine-readable YAML comment holding the blocker, what is needed to unblock it, what is being tried meanwhile, and the re-check date; it renders invisibly because the Markdown sanitiser discards comments.

## Milestones are repository metadata

Milestones are not part of the reserved vocabulary. They are ordinary GitHub milestones, mirrored per repository in `mirror_github_milestone`, and they carry no workflow authority: an issue's stage, priority, size and blocked flag are still the labels. GitHub scopes a milestone to exactly one repository, so Funnel treats `owner/name` plus milestone number as the identity and never merges equal titles across repositories.

The cockpit uses milestones in three places: the **Milestones** view groups them by repository with progress and due dates, the issue feeds add a milestone filter and group-by dimension (`?milestone=owner/name#number`, `none` for unmilestoned issues), and the Inspector can set or clear an issue's milestone. The Inspector picker can create a milestone lazily in the issue's repository, which is the only milestone write Funnel performs; everything else is managed on GitHub.

## Inbox, Issues, and the board

Three views partition the workflow, and each is a query against the local mirror rather than the network (see `src/lib/server/issues/queries.ts`):

- **Inbox** — pending intake submissions followed by untriaged open issues. It is the queue of things that have not been given a stage yet.
- **Issues** — every triaged mirrored issue, open and closed. `allIssues()` filters on `status IS NOT NULL` precisely so the two views form a clean partition: the moment an issue gains a status label it leaves the Inbox and appears here.
- **Board** — four columns by status label for open issues, plus a `Done` column.

The `Done` column is a window, not a place. It holds issues that are closed *as completed* (`state = "closed" AND state_reason = "completed"`) within `board.done_days` (default 14). Issues closed as `not_planned` are omitted entirely, and the window itself is configurable. The consequence is that "Done" is time-relative: a card silently ages out of the column after the window passes, even though the issue is still closed. That is a board affordance, not a data loss — the issue is still in **Issues**, and the mirror keeps `closedAt`.

## Priority ordering

The default sort is a rank expression, not the label string: `PRIORITY_RANK` maps `p1 → 0`, `p2 → 1`, `p3 → 2`, and everything else to `3`, so unprioritised issues sort after prioritised ones. Ties break by `updatedAt` descending. The same rank drives every stream, which is why `PRIORITY_OPTIONS` in the UI is reversed for display: the canonical list keeps `p1`-first order for provisioning, while the picker shows low to high.

## Resolving conflicts

When a group ends up with more than one label — most often because a human adds a second one directly on GitHub — `funnel[bot]` repairs it. It does *not* invent an order. Instead it fetches the issue timeline, extracts the `labeled` events, and applies **latest added wins**: the most recently added label in the conflicted group survives and the rest are deleted with the installation token.

If the timeline cannot decide — there are no `labeled` events for the candidates, or the newest timestamp ties — the resolution is marked **ambiguous**. On an ambiguous result Funnel leaves every label untouched and sets `label_conflict` so the UI can surface it. The comment is explicit that `obsolete` is still computed from the deterministic canonical order, "but callers should not" act on it.

The design choice here is the interesting one: ambiguity is **flagged, not guessed**. Guessing would be cheap and would usually be right, but it would silently destroy a human's label on the strength of a heuristic — and label edits are the workflow, so a wrong guess is a wrong workflow. Flagging hands the decision back to a person while keeping the mirror's projection deterministic. `deriveMetadata` still returns a single deterministic winner (canonical order) for display, so an ambiguous issue renders as *some* status rather than crashing, but the conflict flag rides alongside it.

## Provisioning and self-healing

Because the vocabulary must exist before it can be used, Funnel provisions it and keeps it converged:

- `provisionCanonicalLabels()` runs at startup from the `init` hook before the server answers its first request. It walks every configured repository, creates missing reserved labels, and patches any whose colour or description has drifted from canonical, under the label's existing spelling because GitHub matches names case-insensitively.
- `reconcileRepo()` runs it again during nightly reconciliation, so a label deleted or recoloured in the meantime is restored without a restart.

Provisioning is **idempotent**: a converged repository issues zero writes. It only ever touches the reserved names, and it runs with the GitHub App installation token (`funnel[bot]`), independent of any signed-in user. It is also **non-fatal**: `provisionCanonicalLabels` swallows per-repository errors and a config-load failure, recording them in a report and logging a warning, so an unreachable GitHub or a fresh, un-onboarded instance cannot block or crash startup. The comment notes the throttling trade-off plainly: writes are throttled to roughly one per second, so a repository missing all eleven labels takes about ten seconds to converge, while a converged one returns immediately.

## Work notes and attachments sit outside the labels

Two durable Funnel concepts deliberately do *not* map to GitHub labels:

- **Work notes** (`state_work_note`) are an internal journal. A note is never posted upstream unless explicitly published, and publishing *deletes* the note, turning it into a GitHub comment.
- **Attachments** (`state_attachment`) are a dropbox: metadata in SQLite, bytes under `FUNNEL_UPLOAD_DIR`.

Both are keyed by `owner/name` plus issue number rather than a foreign key to the disposable `mirror_github_issue`, so they survive mirror pruning and a re-sync. Both also snapshot author identity so they still render after the mirror's user table is rebuilt. This is the mirror image of the label model: labels are GitHub-owned and Funnel-cached; notes and attachments are Funnel-owned and GitHub-invisible. Keeping them out of the label vocabulary is what stops an internal note from becoming a change that other tools react to, and what lets Funnel own durable data that GitHub's label API has no place for. Each surface can be hidden in the current browser through its feature flag; there is no instance-wide switch for either.

## Trade-offs: labels as state

Treating labels as the workflow buys real things:

- **Portable.** The state is not trapped in Funnel. Clone the repository, or point another tool at it, and the status is there. Labels survive Funnel being uninstalled.
- **Visible on GitHub.** Reporters, reviewers, and automation all see the same stage without opening Funnel.
- **Editable by anything.** Any label-editing tool, script, or person participates in the workflow with no integration.
- **No lock-in, no sync-back problem.** There is only one direction to reconcile: GitHub → Funnel mirror.

It costs:

- **No atomic multi-field transitions across requests.** A single `PATCH` can change several reserved groups, but the write path reads the authoritative set, computes the new set locally, and `PUT`s it back. A concurrent edit between that read and the write can therefore be lost. There is no database transaction spanning the fields, because there is no local record to transact on.
- **Conflicts are possible by construction.** Nothing stops two status labels coexisting; the system can only detect and repair, never prevent. That repair needs a timeline, and the timeline can be ambiguous.
- **Absence is fragile.** "Untriaged" is encoded as *nothing*, so stripping a label silently returns an issue to the Inbox. Meaning is carried by absence rather than by an explicit value.
- **The mirror is eventually consistent.** Between a write and the following refresh, the local projection can lag GitHub. The write path schedules a background single-issue refresh, and SSE nudges open cockpits, but the read path is never the authority.
- **Language drift.** The reserved names are generic English words that a repository may already be using for something else, which is why provisioning patches only exact reserved names and leaves everything else alone.

## Related

- [The intake lifecycle](intake-lifecycle.md) — how untriaged work arrives in the Inbox before it reaches GitHub.
- [The security model](security-model.md) — who may change labels, and with which token.
- [Sync and mirror](sync-and-mirror.md) — how labels are mirrored and conflicts resolved on each poll.
- [Reserved labels reference](../reference/reserved-labels.md) — the exact names, colours, and descriptions.
- [Settings reference](../reference/settings.md) — `board.done_days`, projects, and repositories.
- [Configure the board](../how-to/configure/board.md) — setting the Done window and Work-in-Progress limits.
- [UI/UX standards](../DESIGN.md) — how the board and streams present this model.
