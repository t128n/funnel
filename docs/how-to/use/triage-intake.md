# Triage intake submissions

This guide explains how submissions reach the Inbox and how to accept, dismiss or duplicate them.

## Where submissions come from

Funnel stages every external report before anything reaches GitHub. There are two entry points.

| Entry point | Who can use it | Result |
| :--- | :--- | :--- |
| `/intake` form | Anyone who can reach the instance; no session is required | A staged submission, visible in the Inbox |
| `POST /api/intake` | Anonymous JSON callers, including browser clients on other origins | `201 {"id": "…"}` for a staged submission |

The `/intake` form accepts:

- **Issue title** — required, trimmed, at most 256 characters.
- **Description** — Markdown, at most 65,536 characters.
- **Add source…** — optional. The picker offers Email, Chat, Meeting, Walk-in and Self-Service; an unknown source label is preserved rather than discarded.

`GET /intake?title=…&body=…&source=…` renders a prefilled draft, and the page also writes a compact deeplink into the address bar as you type. Both forms are clamped to the limits above. The form needs no JavaScript: it posts as a plain HTML form, and submission failures render inline.

`POST /api/intake` accepts this JSON body:

```json
{
  "title": "Crash when saving a board",
  "body": "1. Open /board\n2. Drag a card\n3. See 500 in the console",
  "source": "support-portal"
}
```

`title` is required and trimmed to 1–256 characters. `body` is optional and capped at 65,536 characters. `source` is optional and trimmed. A successful request returns `201` with an opaque submission id. A malformed body returns `400` with a `message`; a body that fails validation returns `message` plus an `issues` array of human-readable reasons. The endpoint carries open CORS headers for browser callers.

Nothing is created on GitHub until a triager accepts the submission. See [the workflow model](../../explanation/workflow-model.md) for why staging is separate from the GitHub mirror.

## How the Inbox is ordered

The Inbox is a single queue with two parts, always in this order:

1. **Staged** submissions, newest first. Same-millisecond ties are broken deterministically by insertion order.
2. **Untriaged issues** — open issues with no status label. These are ordered by derived priority (`P0` first, unprioritised last), then by most recently updated.

The **Staged** group can be collapsed. The issue half can be grouped with the group-by control, like the other issue streams.

Search applies to both halves: it matches a submission's title and body, and an issue's title, body and comments. The repo, status, assignee, priority, size and label filters apply only to GitHub issues; the Inbox has no state switch. Pending submissions have no repo or workflow metadata, so they remain visible unless the search term excludes them.

The Inbox badge in the sidebar counts pending submissions plus untriaged open issues. A `read` user can browse the queue; only a `write` user can make a triage decision. See [roles and permissions](../../reference/roles-and-permissions.md).

## Open a submission

Select a **Staged** row, or press Enter or Space while it is focused. The detail pane shows the intake tag, the source when one was recorded, the title, when it was staged, and the rendered Markdown description. An empty description is shown as “No description provided.”

The pane has three decisions: **Dismiss**, **Duplicate** and **Accept**.

## Accept a submission

Accepting creates the GitHub issue and clears the staged row.

1. Select the **Repository** pill. The options come from the repositories currently in the mirror; the server still rejects a target that is not in Settings → Repositories. The initial selection is `intake.default_repo`, falling back to the first configured repository, then to the first available option.
2. Optionally choose a **size** (`S`, `M`, `L`). Priority is not set at intake: it is derived later in the Inspector from impact and urgency.
3. Select **Accept**.

What Funnel does:

- Requires a `write` session and a resolvable GitHub user token.
- Rejects a repository that is not in the instance settings. If no repository can be resolved, the request fails with “No target repository selected”.
- Creates the issue with the submission's title and body, plus a provenance footer such as `_Submitted via Funnel intake (source: email)_`.
- Applies the `backlog` status label first, followed by the selected size label. Retired `p1`–`p3` labels are never written.
- Hard-deletes the staged row only after GitHub confirms the create.
- Publishes an intake event so open cockpits remove the row from the queue.

The Accept form does not offer labels or assignees. Set those after creation from the issue inspector; see [Create and edit issues](create-and-edit-issues.md).

If the GitHub write fails, the submission stays staged and the Inbox shows the failure message above the queue. The detail pane remains open so you can correct the choice and retry.

## Dismiss a submission

1. Select **Dismiss**.

Dismissal requires a `write` session but no GitHub token, because it only touches local staging state. The row is hard-deleted immediately and no GitHub issue or comment is created. A failure restores the row and reports the error in the Inbox.

## Duplicate a submission

Duplication records the report as a comment on an existing mirrored issue.

1. Select **Duplicate**.
2. Choose the **Repository**. The issue picker loads mirrored issues for that repository, most recently updated first. It includes open and closed issues and shows each issue's state through the label colour. The picker is limited to the 100 most recent issues by default (the API caps it at 200).
3. Choose the **Existing issue**.
4. Select **Duplicate**.

Funnel requires a `write` session and a GitHub user token. The repository and issue must already be present in the mirror. It posts a comment containing the submission title in bold, the submission body and the provenance footer, then hard-deletes the staged row. There is no free-text comment field: the comment is generated from the submission. If the comment fails, the row is restored and the dialog shows the error.

## Hard-delete semantics

Every triage decision removes the staged row. There is no trash, archive or local history.

| Decision | GitHub write | Staged row |
| :--- | :--- | :--- |
| Accept | Creates an issue | Deleted after GitHub confirms |
| Dismiss | None | Deleted immediately |
| Duplicate | Posts a comment on an existing issue | Deleted after GitHub confirms |

The GitHub-backed decisions are pessimistic: Accept and Duplicate delete the row only after GitHub confirms. Dismiss deletes immediately because it has no upstream write. If Funnel crashes after GitHub accepts an issue but before the row is deleted, the row can remain staged; retrying Accept would create a second issue. Durable history lives on GitHub once the submission is accepted.

If a submission id is no longer present, the detail route returns a 404.

## Related

- [The workflow model](../../explanation/workflow-model.md)
- [Reserved labels](../../reference/reserved-labels.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
- [Create and edit issues](create-and-edit-issues.md)
- [Close, reopen and block issues](close-reopen-block.md)
