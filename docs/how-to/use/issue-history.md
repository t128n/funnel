# Read issue history

This guide shows you how to read an issue's activity history, separate it from the public comment thread, and understand why a change does or does not appear.

Sign in with at least the `read` role and open a mirrored issue. Reading or filtering its history does not require write access.

## What the Activity section shows

The **Activity** section of an issue merges three kinds of entry in chronological order:

- **Comments** mirrored from GitHub.
- **History** from Funnel's local observation log: status, open/closed state, blocked flag, derived priority, labels and assignees.
- **GitHub timeline history** for actions Funnel does not observe locally, such as references, mentions, title renames, and milestone changes.

An issue accepted from an intake submission also gets a **Created from intake** entry with the triaging person and the decision time. Comments are never copied into history, so every comment appears exactly once.

## Filter the activity

Use the **All**, **Comments** and **History** buttons above the timeline:

1. Open an issue from Inbox, Issues, the board or the matrix.
2. Find **Activity** below the description.
3. Select **Comments** to read only the public conversation, or **History** to read only changes.
4. Select **All** to merge both streams in time order.

The filter is a view preference for the open page. It does not change the issue and is not written to GitHub.

## Understand each history entry

A history entry shows the acting person when known, a one-line summary, and a relative time with the exact timestamp in its tooltip.

- Status, state and priority summaries read as a change from the previous value, for example **Status changed from backlog to in-progress**.
- Label entries name the label, and assignee entries use the login, for example **Added label "bug"** or **Assigned @alice**.
- GitHub references read as **cross-referenced this issue from #12**; mentions, renames and milestones have their own summaries.
- A local change with no acting person is attributed to **Funnel**.

## Why history starts when Funnel starts

Local history is observed, not backfilled from GitHub. When Funnel first sees an issue it records a baseline for status, state and blocked, then logs later changes. Labels and assignees present on that first sighting are intentionally not retold as a burst of activity, and priority is only logged when it changes.

GitHub timeline history is imported for the same window as the issue mirror, set by `sync.history_days` (90 days by default), and only the newest 50 timeline items per issue are requested on each hydration. Older GitHub events are not imported. Existing imported events are retained even when the window moves forward, and are removed only when the issue itself is pruned from the mirror.

## If an entry is missing

- A label or assignee change made before Funnel first observed the issue has no local entry by design.
- A GitHub event older than the history window or beyond the newest 50 items was not imported.
- A mirrored label, assignment or close/reopen is hidden when the local log already records the same change, so the timeline never shows it twice.
- A comment is shown once as a comment, not again in history.

If history stays empty for an issue you know changed, confirm that sync is healthy under **Settings → Sync**, then let one poll or a manual sync complete.

## Next

[Comment on the issue](comments.md) to continue the public conversation, or [review work needing attention](attention.md).
