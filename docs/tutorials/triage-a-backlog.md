# Triage a backlog

This tutorial follows one issue through Funnel's full working loop: a public submission is staged, accepted into a repository, triaged, moved across the board, blocked with a re-check date, annotated internally, published, closed with a resolution, and reopened.

It assumes you have completed [Getting started](getting-started.md), have one repository configured, and are signed in as its first account (which is `admin`). Mutations require the `write` or `admin` role; settings require `admin`. A `read` account can follow along visually, but the write controls are disabled and the server rejects the mutations.

## 1. Stage a submission through intake

Open <http://localhost:5173/intake>. This page is public: it does not require a session.

1. Enter a title, for example **Export CSV fails when the filter is empty**.
2. Add a description describing what happened and what you expected.
3. Optionally choose a source such as **Email** or **Chat**.
4. Click **Submit**.

**You should see:** **Thanks — your submission is in.** The page confirms that nothing has been created on GitHub yet. The staged row lives only in Funnel's SQLite database.

> Tools can stage the same queue through `POST /api/intake` with a JSON body containing `title`, `body`, and `source`. See [Use the intake API](../how-to/integrate/intake-api.md).

## 2. Open the Inbox

Click **Inbox** in the sidebar.

**You should see:** a **Staged** section at the top of the queue containing your submission, followed by any open GitHub issues that have no status label. The sidebar badge counts both kinds of queue entry.

Select the submission row.

**You should see:** a detail pane headed with an **Intake** marker, the submission title, the source, and its description. The footer offers **Dismiss**, **Duplicate**, and **Accept**, with **Repository**, **Priority**, and **Size** pills above them.

## 3. Accept the submission into a repository

1. Choose the target repository from the **Repository** pill. It lists the repositories Funnel has mirrored; if the first sync has not populated the picker yet, Funnel uses the configured intake default.
2. Optionally set **Priority** and **Size**.
3. Click **Accept**.

**You should see:** the row disappear from the Staged section and the detail pane close. Funnel has created a GitHub issue with:

- the submission title and body;
- a provenance footer recording that it came through Funnel intake (and the source, when one was chosen);
- the `backlog` status label, plus the size label you picked.

The new issue appears in **Issues**, and in the board's **Backlog** view once the background refresh lands. If the write fails, the row stays staged and the Inbox shows the error so you can retry.

## 4. Triage an untriaged issue

The accepted issue already carries `backlog`, so it is not in the untriaged queue. To practise triage, create a second issue directly on GitHub:

1. In the same repository, create an issue titled **Remember the last board filter**, with any description.
2. Do not add any of Funnel's status labels (`backlog`, `todo`, `in-progress`, `in-review`).
3. Wait for Funnel's next poll. With the cockpit open, the default active cadence is 30 seconds; when idle it backs off to 300 seconds.

**You should see:** the issue appear in the Inbox below the Staged section, with no status label (its status glyph reads **No status**).

Select it, then choose **Todo** from the status pill (currently labelled **No status**).

**You should see:** a toast reading **Triaged · moved to Issues** with an **Undo** action, and the row leave the Inbox. The issue now appears in **Issues**. The status write is what makes the issue triaged; an open issue with no status label belongs to the Inbox instead.

## 5. Move a card on the Board

Click **Board** in the sidebar. The **Board** segment shows Todo, In Progress, In Review, and Done; **Backlog** is a separate list view and not a lane.

Find the **Remember the last board filter** card in **Todo** and drag it to **In Progress**.

**You should see:** the card move immediately, the two column counts update, and the move persist once GitHub confirms it. The card's column is its workflow status. `read` accounts can browse the board but cannot drag cards.

## 6. Inspect the issue

Click the card.

**You should see:** the inspector open beside the board (or over it on a narrow window). It contains:

- the editable title and the `owner/name#number` reference;
- the description, with an edit affordance for writers;
- property pills for **Blocked**, status, impact, urgency, derived priority, size, assignees, and labels;
- **Activity** for GitHub comments;
- **Work notes** for Funnel-local notes;
- **Files** for the attachment dropbox;
- an external-link button to open the issue on GitHub.

## 7. Block it with a re-check date

1. Click the **Blocked** pill.
2. In the **Block issue** dialog, fill **Blocker** (required), for example **Waiting on the design review**.
3. Fill **Needs to unblock** (required), for example **Sign-off from the design owner**.
4. Optionally fill **Currently trying**.
5. Set **Re-check date** to tomorrow: click **Tomorrow**, or pick the date in the date field.
6. Click **Block issue**.

**You should see:** a red **Blocked** banner in the inspector showing the blocker, the next step, and the re-check date. Funnel has also posted a **Blocked** comment on the issue, stored the structured fields in the issue body's hidden `funnel_metadata` envelope, and applied the `blocked` label. The blocker details are therefore visible on GitHub as well as in Funnel.

## 8. See it in Attention

Click **Attention** in the sidebar.

**You should see:** the issue under **Upcoming**, with a re-check pill reading **in 1d** (or the equivalent for the date you chose) and a **Blocked** marker. Attention lists open, blocked issues whose re-check date falls within the next seven days, grouped as **Overdue**, **Due Today**, and **Upcoming**.

The sidebar badge counts only overdue and due-today items, so a re-check set for tomorrow does not raise the badge. Use the row's calendar action to move the re-check date without re-recording the block, or open the row to return to the issue.

## 9. Add a work note

Click the issue row in Attention to open it in the Issues view. In the inspector's footer composer, switch the channel from **Comment** to **Note**, type an internal update such as **Design owner is on leave until Monday**, and submit it with the arrow button (or `Mod+Enter`).

**You should see:** the note appear under **Work notes** with an **Internal** marker and the note count increase. The note is stored in Funnel, not posted to GitHub, and it survives mirror re-syncs because it is keyed by repository and issue number.

## 10. Add an attachment

In the **Files** section of the inspector, drop a small file onto the drop zone or click **browse** and pick one.

**You should see:** the file listed with its size, uploader, and relative time. Use the download button to fetch it and the trash button to remove it. The bytes are stored under `FUNNEL_UPLOAD_DIR`; the database holds only metadata.

Uploads are capped by `FUNNEL_UPLOAD_MAX_BYTES` (10 MiB by default). A deployed instance also has to allow the request through `BODY_SIZE_LIMIT`, so keep test files small.

## 11. Publish the note

In the note's action row, click the send icon (its tooltip reads **Publish to GitHub as a comment (removes the note)**).

**You should see:** a toast reading **Work note published as a comment**, the note disappear from **Work notes**, and the same text appear in **Activity** (and on GitHub) once the background mirror refresh lands. Publishing is one-way: the local note is deleted and the GitHub comment becomes the durable record.

## 12. Close with a resolution

Open the status pill in the inspector and choose **Done**.

1. Choose **Completed** (or **Not planned**).
2. Enter a required **Resolution note**, for example **Filter guard shipped in 1.4.2**.
3. Click **Close issue**.

**You should see:** the issue's state change to closed. Funnel posts the resolution note as a comment before closing, then stores the GitHub state reason. A completed issue appears in the board's **Done** lane for the configured Done window (14 days by default). Because Attention only lists open issues, it drops out of that view.

## 13. Reopen it

With the issue still open in the inspector, choose **Todo** from the status pill. Because the issue is closed, Funnel raises the **Reopen issue** dialog instead of writing a status directly.

1. Enter a required **Reopen note**, for example **The regression returned on a legacy export**.
2. Click **Reopen issue**.

**You should see:** the issue reopen, the note appear in Activity, and the status become **Todo** in the same flow. The card returns to the board's Todo lane. If the issue is still flagged `blocked` and its re-check date is still within the next seven days, it also returns to Attention.

## Related

- [Triage intake](../how-to/use/triage-intake.md)
- [Create and edit issues](../how-to/use/create-and-edit-issues.md)
- [Use the board](../how-to/use/board.md)
- [Close, reopen, and block](../how-to/use/close-reopen-block.md)
- [Work notes and attachments](../how-to/use/work-notes-and-attachments.md)
- [Keyboard shortcuts](../how-to/use/keyboard.md)
- [Roles and permissions](../reference/roles-and-permissions.md)
- [Reserved labels](../reference/reserved-labels.md)
- [Workflow model](../explanation/workflow-model.md)
- [Intake lifecycle](../explanation/intake-lifecycle.md)
