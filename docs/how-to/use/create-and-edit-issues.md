# Create and edit issues

This guide explains how issues are created in Funnel, how to create them directly through the API, and how to edit their fields in the inspector.

## Choose a creation path

| Path | Who it is for | What happens |
| :--- | :--- | :--- |
| **New issue** in the cockpit (`C`, the sidebar `+`, or a board column `+`) | People working inside Funnel | Opens the `/intake` composer. Submitting stages the report; a triager accepts it and chooses the repository. |
| `POST /api/repos/{owner}/{repo}/issues` | Integrations and automation | Creates the GitHub issue immediately, with the signed-in user's token. |

The cockpit does not have a separate create dialog with repository, label and assignee pickers. The **New issue** action opens the intake composer, whose only fields are title, description and source. Repository selection and optional priority and size are chosen by the triager when the submission is accepted. Labels and assignees are applied after creation in the inspector.

| What you want to set | Where it is set on the cockpit path |
| :--- | :--- |
| Repository | The triager's **Repository** pill at Accept |
| Status | `backlog` is applied at Accept; change it later with the status pill |
| Priority and size | The optional pills at Accept, or the inspector afterwards |
| Labels and assignees | The inspector after creation |
| Milestone | The inspector after creation |
| Blocked flag and blocker details | The inspector or board after creation |

### Create through the cockpit

1. Press `C` or select the sidebar **New issue** button. Both open `/intake`. The `C` shortcut is registered only for `write` users, and the sidebar button is disabled for `read` users.
2. Enter an **Issue title**. It is required, trimmed, and limited to 256 characters.
3. Enter a **Description**. Markdown is supported and the body is limited to 65,536 characters.
4. Optionally choose a source (Email, Chat, Meeting, Walk-in, Self-Service) or leave it blank. The form submits with `⌘`/`Ctrl` + Enter.
5. Submit. The draft is staged, not created on GitHub.
6. A triager accepts it from the Inbox, choosing the repository and any priority or size. Acceptance applies the default `backlog` status. See [Triage intake submissions](triage-intake.md).

The form keeps a shareable deeplink in the address bar as you type and shows a character counter near the title limit. A failed submission keeps your text and shows the validation error inline.

### Create through the API

`POST /api/repos/{owner}/{repo}/issues` creates a GitHub issue directly. It requires a `write` session and the signed-in user's GitHub token. The repository must be configured in Settings → Repositories; any other repository is rejected with `400 Repository … is not configured`.

| Field | Required | Rules |
| :--- | :--- | :--- |
| `title` | Yes | String, trimmed, non-empty, at most 256 characters |
| `body` | No | String, at most 65,536 characters; defaults to an empty body |
| `labels` | No | Array of non-empty, trimmed label names |
| `assignees` | No | Array of non-empty, trimmed GitHub logins |
| `status` | No | `backlog`, `todo`, `in-progress` or `in-review` |
| `priority` | No | `p1`, `p2` or `p3` |
| `size` | No | `sm`, `md` or `lg` |

Example:

```json
{
  "title": "Board crashes when saving a filtered view",
  "body": "Steps to reproduce…",
  "labels": ["bug", "needs-triage"],
  "assignees": ["octocat"],
  "status": "todo",
  "priority": "p2",
  "size": "md"
}
```

A successful request returns `201` with `{ "number": …, "htmlUrl": "…" }`. Validation failures return `400` with a `message` and an `issues` array. A GitHub rejection is passed back with GitHub's status where available. After a successful create, Funnel schedules a background refresh so the new issue appears in the mirror.

`done` is not a valid `status`: Done is the closed state, not a label. Close an issue through the structured close flow instead. `blocked` has no dedicated create field: include the `blocked` label in `labels` if you need to set the flag, but that does not write the structured blocker metadata, so use the inspector or board block flow when the issue should appear in Attention.

An issue created without a status label is untriaged and appears in the Inbox, not in All Issues or on the board.

## Reserved labels and one-per-group behaviour

Status, priority and size are represented by reserved labels. Funnel keeps at most one label from each group.

| Group | Values | Absence means |
| :--- | :--- | :--- |
| Status | `backlog`, `todo`, `in-progress`, `in-review` | Untriaged (Inbox) |
| Priority | `p1`, `p2`, `p3` | No priority |
| Size | `sm`, `md`, `lg` | Unestimated |
| Flags | `blocked` | Not blocked |

For a direct API create:

- `labels` is normalised first, case-insensitively. If it contains more than one label from the same group, the first one wins.
- The `status`, `priority` and `size` shortcuts then replace any sibling already present in `labels`. For example, `labels: ["todo"], status: "in-progress"` creates the issue with `in-progress`, not `todo`.
- Non-reserved labels are preserved.
- The `blocked` flag has no dedicated shortcut; a `blocked` entry in `labels` is kept as a flags label.

The inspector uses the same rule when you change a status, priority or size: it reads the issue's authoritative label set from GitHub, removes every label in that group, and writes the replacement in one request. See [Reserved labels](../../reference/reserved-labels.md) for the full vocabulary.

## Edit an issue

Open an issue from Issues, the Inbox, or the board. The inspector pane is the editor. Every control below requires the `write` role; `read` users see the same content with the controls disabled.

| Field | Control | Behaviour |
| :--- | :--- | :--- |
| Title | Inline title input | Press Enter or move focus away to save, or use the **Save** button that appears while the title is dirty. The title is trimmed; it must be non-empty and at most 256 characters. |
| Description | Click the description to edit | The textarea has **Save** and **Cancel**. `⌘`/`Ctrl` + Enter saves. The body may be empty and is limited to 65,536 characters. |
| Assignees | **Assignee** multi-select | Selecting or clearing people writes the whole assignee list, because the GitHub endpoint replaces it. Options are the repository's assignable users plus anyone currently assigned. |
| Labels | **Labels** multi-select | Adds and removes non-reserved labels. Reserved status, priority, size and flag labels are deliberately excluded from this picker. |
| Status | Status pill | Shows **No status**, Backlog, Todo, In Progress, In Review or Done. Choosing Done opens the close dialog; choosing an open status on a closed issue opens the reopen dialog. |
| Priority | Priority pill | `P1`, `P2`, `P3`, or cleared to no priority. |
| Size | Size pill | `S`, `M`, `L`, or cleared to unestimated. |
| Milestone | **Milestone** pill | Attaches, clears, or lazily creates a repository milestone. GitHub scopes milestones per repository, so the picker only offers the issue's repo. See [Use milestones](milestones.md). |
| Blocked | **Blocked** pill | Opens the block or unblock dialog. See [Close, reopen and block issues](close-reopen-block.md). |

The description editor hides the trailing `funnel_metadata` envelope used for blocker state and re-attaches it verbatim when you save, so editing prose cannot silently drop structured metadata. If the body has just been saved and the mirror has not delivered a fresh render yet, the pane shows the plain text until the refresh arrives.

Setting the first status on an issue opened from the Inbox moves it out of the queue immediately and shows a “Triaged · moved to Issues” toast with an **Undo** action.

### Label add and remove

The label picker excludes reserved labels because those belong to their own controls. When you change the selection, Funnel compares it with the current non-reserved labels:

- New labels are sent together in one add request.
- Removed labels are deleted one at a time.
- Status, priority, size and blocked are untouched by this control.

If a label request fails, the row rolls back and the failure is reported. A partially completed sequence can leave some labels changed on GitHub even though the UI has rolled back.

## Optimistic and pessimistic writes

Funnel is optimistic where it can be, and pessimistic where correctness depends on ordering.

**Optimistic writes** apply an overlay to the local view before the network request starts. This covers the title, status, priority, size, assignees, labels and the blocked flag. If the request fails, the overlay is removed, the previous value returns, and a toast reports the error. Dialogs show their error inline instead of a toast.

The description editor is not optimistic: it stays in edit mode until the body write succeeds, then shows the plain text until a fresh render arrives from the mirror.

**Pessimistic writes** wait for the server:

- GitHub comments, work notes and attachment uploads/deletes complete before the inspector reloads.
- Intake Accept, Dismiss and Duplicate wait before the staged row is removed; the row is hidden optimistically but restored on failure.
- Close, reopen, block and unblock post their note as a comment first, then apply the state or metadata change. The optimistic overlay still applies before the write completes, and rolls back if the sequence fails.

## Post-write refresh

Issue, label, comment, work-note and attachment writes publish a local `issues` event. GitHub-backed writes also schedule a background refresh of that single issue from GitHub. The SSE client then refreshes the current streams and signals the inspector to refetch.

Overlays are dropped by value, not by refresh count: an overlay is removed only once the authoritative issue actually reflects the change. A refresh that arrives before the mirror catches up therefore leaves the optimistic value in place instead of bouncing it back.

## Related

- [The workflow model](../../explanation/workflow-model.md)
- [Reserved labels](../../reference/reserved-labels.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
- [Triage intake submissions](triage-intake.md)
- [Close, reopen and block issues](close-reopen-block.md)
