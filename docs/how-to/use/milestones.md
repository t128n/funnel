# Use milestones

This guide explains how Funnel mirrors GitHub milestones, how to browse and filter them, and how to set or create one from an issue.

## What a milestone is in Funnel

GitHub scopes a milestone to exactly one repository. Funnel preserves that model: a milestone is identified by `owner/name` plus its number, and the same title in two repositories is two milestones, not one cross-repo object.

The mirror is read-only apart from one lazy-create path. Funnel never renames, closes, reopens or deletes a milestone; manage those on GitHub. It can create a milestone when an issue is assigned to a title the repository does not have yet.

## Browse milestones

Select **Milestones** in the sidebar to open `/milestones`.

- Milestones are grouped by repository, with a progress bar showing closed issues against the total (`closedIssues / (openIssues + closedIssues)`).
- Each entry shows its due date, and a `closed` marker when the milestone is closed.
- The creator is shown when the mirrored GitHub user can be resolved.
- Select an entry to open `/milestones/{owner}/{repo}/{number}`, which lists every mirrored issue attached to it — open and closed, triaged or untriaged.

The list is built from the local mirror, so it reflects the last successful sync or refresh. If a milestone was created directly on GitHub, it appears after the next repository cycle; a milestone created from the Inspector is refreshed immediately.

## Filter and group issues by milestone

The issue feeds support milestones as a filter dimension and as a grouping option.

- In the filter popover, choose one or more milestones, or **No milestone**.
- The URL uses repo-scoped slugs: `?milestone=owner/name#number`. Repeat the parameter or comma-separate values to select several. `?milestone=none` selects unmilestoned issues.
- In the **Group by** control, choose **Milestone** to section the feed by milestone title. The option appears only when at least one mirrored repository has a milestone. Issues without a milestone are grouped under **No milestone**.

Milestone filtering is available in the Inbox, Issues and Board queries wherever the shared filter bar is rendered. The milestone dimension combines with the others as OR within the dimension and AND across dimensions.

## Set or clear an issue's milestone

Open an issue in the Inspector and use the **Milestone** pill.

- Select an existing milestone from the repository's list to attach it.
- Select **Clear** to remove the milestone.
- Select **New milestone…** to create one in the issue's repository, then attach it. The form takes a **title** and an optional **due date** (`YYYY-MM-DD`). The title is trimmed, required, and limited to 256 characters.

Creating from the Inspector only creates the milestone in that issue's repository. To make the same milestone span repositories, create or attach it separately in each repository.

Attaching or clearing a milestone requires the `write` role and a GitHub token with permission to edit the issue. GitHub remains the authority; Funnel schedules a single-issue refresh after the write, and the success or failure is reported by the Inspector.

## API

Two endpoints cover the write paths.

`POST /api/repos/{owner}/{repo}/milestones` creates a repository milestone with the signed-in user's token:

```json
{
  "title": "v1.0",
  "description": "First public release",
  "dueOn": "2026-12-31"
}
```

`title` is required and limited to 256 characters; `description` is optional and limited to 65,536 characters; `dueOn` is an optional `YYYY-MM-DD` date or `null`. The response is `201 { "number": 3, "htmlUrl": "…" }`. The repository must be configured in Funnel.

`PATCH /api/repos/{owner}/{repo}/issues/{number}` accepts `milestone` as a positive integer to attach a repository milestone, or `null` to clear it. Omitting the field leaves the milestone untouched. See the [HTTP API reference](../../reference/http-api.md#milestones) for the full contract.

## Related

- [Create and edit issues](create-and-edit-issues.md)
- [The workflow model](../../explanation/workflow-model.md)
- [HTTP API](../../reference/http-api.md#milestones)
- [Routes and pages](../../reference/routes-and-pages.md)
- [Database schema](../../reference/database-schema.md#mirror_github_milestone)
