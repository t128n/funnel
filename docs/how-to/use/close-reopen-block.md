# Close, reopen and block issues

This guide explains the guarded close and reopen flows, how to record a blocker, and how blocked issues surface in Attention.

## Close an issue

Closing from the cockpit always records a resolution and a note. You can start the flow from:

- the inspector's status pill, by choosing **Done**;
- a board card's **Issue actions** menu, by choosing **Close issue**;
- dragging a card into the **Done** lane;
- the Attention row's **Mark done** button.

1. Choose a **Resolution**: **Completed** or **Not planned**. These map to GitHub's `completed` and `not_planned` state reasons.
2. Enter a **Resolution note**. It is required; the close action stays disabled while the note is empty.
3. Select **Close issue**.

What Funnel does:

- Posts the note as a GitHub comment first.
- Then changes the issue to closed with the chosen state reason.
- Leaves every label untouched, including the current status and size.

The order matters. If the comment fails, the issue is not closed. If the comment succeeds but the state change fails, the note remains on the issue and you can retry. The dialog shows failures inline and stays open.

Closing is optimistic in the UI: the card moves to Done as soon as you confirm, and rolls back if the write fails. On the Attention view, the row leaves the feed when it reloads after a successful close. A **Completed** issue stays in Done for the board's retention window (`board.done_days`). A **Not planned** issue is omitted from the board entirely.

Because closing does not clear labels, reopening later restores the status the issue had before it was closed.

## Reopen an issue

Reopening from the cockpit requires a note and can optionally apply a status.

Start it from:

- a closed board card's **Issue actions** menu, by choosing **Reopen issue**;
- dragging a card out of **Done** into another lane;
- the inspector's status pill while the issue is closed, by choosing an open status.

1. Enter a **Reopen note**. It is required.
2. Select **Reopen issue**.

What Funnel does:

- Posts the reopen note as a comment first.
- Then reopens the issue.
- If the action carried a target status, it applies that status in the same update, replacing the preserved status label.

The reopen dialog itself has no status selector. The status comes from the action that opened the dialog: a lane drop or an inspector status choice applies that lane; the board menu's **Reopen issue** keeps the existing status. The resolution radio buttons are a close-only control and are not used when reopening.

As with closing, the note is posted before the state change, failures render inline, and the optimistic card movement rolls back if the write fails.

## Block an issue

Blocking records why an issue is stuck and keeps the issue in its current workflow stage. It does not move the issue to a separate column.

Start it from:

- the inspector's **Blocked** pill;
- a board card's **Issue actions** menu, by choosing **Block…**;
- an Attention row's **Update block…** action.

| Field | Required | Purpose |
| :--- | :--- | :--- |
| **Blocker** | Yes | What is blocking the issue |
| **Needs to unblock** | Yes | The concrete step that must happen to unblock it |
| **Currently trying** | No | What is being attempted in the meantime |
| **Re-check date** | No | A `YYYY-MM-DD` date for the next review |

The block dialog offers quick re-check anchors — **Tomorrow**, **In 3 days**, **Start of next week** and **End of week** — plus a date input for a custom date. Anchors that resolve to the same date on a given day are de-duplicated.

What Funnel does:

1. Posts a structured blocker summary as a comment. It includes the blocker and the “needs to unblock” step, plus the optional “currently trying” text and re-check date.
2. Writes the same information into the issue body as a machine-readable `funnel_metadata` envelope.
3. Adds the `blocked` flag label.

The comment comes first, so a blocker is never recorded without its explanation. If the comment fails, neither the metadata nor the flag is applied. If the comment succeeds but the follow-up update fails, the comment remains and the metadata and flag may be partially applied; reopen the dialog and retry to make the stored state consistent.

The body metadata looks like this:

```markdown
<!-- funnel_metadata
blocked:
  is_blocked: true
  blocker: "Waiting for the upstream API fix"
  needs: "Ship vendor release 4.2"
  trying: "Pinned the previous version locally"
  recheck: "2026-10-26"
-->
```

The envelope is an HTML comment, so it never appears in the rendered description. The inspector's body editor strips it while editing and re-attaches it on save. Keep it intact: Attention is driven by this metadata, not by the `blocked` label alone.

A re-check date is optional for blocking, but an issue without a valid re-check date does not appear in Attention.

### Revise or reschedule a block

- **Update block…** on an Attention row opens the block dialog prefilled with the stored blocker, needs, trying and re-check values. Confirming posts a new blocker summary comment and replaces the stored metadata.
- The **Reschedule re-check** menu on an Attention row offers the same quick anchors plus **Custom date…**. Choosing a quick anchor rewrites only the re-check date in the body metadata and does not post a comment. **Custom date…** opens the prefilled block dialog so you can pick a date and confirm.

## Unblock an issue

Start it from the inspector's **Blocked** pill, a board card's **Unblock…** action, or an Attention row's **Unblock…** action.

1. Enter **What unblocked it**. It is required.
2. Select **Unblock issue**.

Funnel posts an `### ✅ Unblocked` comment first, then clears the blocker fields. It writes an envelope with `is_blocked: false` rather than leaving the old blocker text in place, and removes the `blocked` flag label. If the issue body never carried Funnel metadata, the body is left untouched; the label is still removed.

The UI flips the blocked indicator before the write completes and rolls back if it fails.

## Attention

Attention lists open issues that carry the blocked flag, have `is_blocked: true` in their body metadata, and have a valid `YYYY-MM-DD` re-check date.

The page groups items into:

| Group | Meaning |
| :--- | :--- |
| **Overdue** | Re-check date before today |
| **Due Today** | Re-check date is today |
| **Upcoming** | After today, up to and including seven days from today |

Dates are compared in the browser's local timezone, and the shared clock re-evaluates “today” at midnight. A blocked issue whose re-check date is more than seven days away, or whose date is missing or malformed, does not appear in this view.

The sidebar Attention badge counts only overdue and due-today items. The **All/Mine** switch filters the list to issues assigned to you, using the same `assignee=me` scope as the Issues view.

Each Attention row links to the issue in the Issues view and offers these actions on hover:

- **Reschedule re-check** — quick dates, or a custom date through the prefilled block dialog.
- **Assign to me / Unassign me** — toggle your assignment.
- **Mark done** — opens the structured close dialog.
- **Issue actions** — **Update block…**, **Unblock…** or **Open issue**.

Assignment writes use the shared optimistic overlay for the issue streams, but the Attention feed is not projected through it: the row's icon updates when the feed reloads after the write. Priority is display-only in Attention; use the Inspector's Priority popover to edit impact and urgency. Rescheduling rewrites the body metadata and likewise shows the new date on the next feed reload. Closing an item removes it from the feed after the write lands.

## Related

- [The workflow model](../../explanation/workflow-model.md)
- [Reserved labels](../../reference/reserved-labels.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
- [Use the board](board.md)
- [Create and edit issues](create-and-edit-issues.md)
