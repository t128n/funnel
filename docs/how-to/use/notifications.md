# Use notifications

This guide explains what Funnel notifies you about, how to watch an issue, how read state and the sidebar badge work, and how to turn on browser notifications.

## What you are notified about

Funnel records a notification for a signed-in Funnel user when one of these events happens:

| Event | Who is notified | Where the link goes |
| :--- | :--- | :--- |
| You are newly assigned to an issue. | The new assignee. | The issue Inspector. |
| A comment mentions you with `@login`. | The mentioned user, even without watching. | The issue Inspector. |
| Someone comments on an issue you watch. | Every watcher except the comment author. | The issue Inspector. |
| A watched issue's status label changes (`backlog`, `todo`, `in-progress`, `in-review`). | Every watcher. | The issue Inspector. |
| A watched issue's priority label changes (`p1`, `p2`, `p3`). | Every watcher. | The issue Inspector. |
| A watched issue is opened or closed. | Every watcher. | The issue Inspector. |
| A public intake submission is staged. | Every administrator with a linked GitHub account, unless the master switch or new-intake notices are off. | `/inbox/submission/{id}`. |

Only people with a Funnel account linked to their GitHub identity receive notifications. A mention of an unlinked GitHub login is ignored, and the change still reaches other eligible recipients.

A mention wins over a plain watched-comment notice for the same person and comment, so you get one notification rather than two. You are never notified about a change you made yourself, including a comment you wrote on an issue you watch.

Notifications are created only when a change is detected against an issue Funnel already knows. The first sync of a repository is silent: existing issues, comments and assignments do not produce a backlog of notices. Repeated polling and the refresh after a Funnel write reuse the same event key, so each event is delivered once.

## Open the notification center

Select **Notifications** in the sidebar to open `/notifications`. The item carries the unread count and updates live while the page is open.

- Unread rows appear before read rows; each group is newest first.
- A row shows the actor's avatar and login, the destination (`owner/name#7` or an intake submission), a relative time, and a short excerpt for comments and mentions.
- Opening an unread row marks it read and takes you to the issue or submission. Modified clicks (for example Ctrl-click) keep the browser's new-tab behaviour and do not mark the row read.
- **Mark read** clears one row; **Mark all read** clears every unread row for you.
- Read state is stored per user. Another signed-in person never sees or changes your rows, and your unread count survives a reload.

## Watch an issue

Open an issue in the Inspector and use the **Watch** / **Watching** toggle in the property row. Watching is personal and works for any mirrored issue.

- **Watch** starts delivering comments and status, priority and open/closed changes for that issue.
- **Watching** stops them when selected again.
- The watch is keyed by `owner/name` plus issue number, so it survives mirror pruning and a re-sync.
- Watching does not subscribe you to assignment notices; those go to the new assignee. It also does not make you the author of anything, so your own actions stay silent.

## Browser notifications

Browser notifications are optional and disabled per browser until you opt in. On `/notifications`, select **Enable** and grant the browser's permission prompt. The choice is remembered in that browser's local storage.

Limits to keep in mind:

- Browser notifications require HTTPS or `localhost`, browser support for the Notification API, and a permission grant. A denied or dismissed prompt cannot be re-requested from Funnel; change the site permission in the browser's settings.
- They are delivered only while a Funnel tab is open. There is no service worker, no background push, no email and no webhook.
- Each open tab fetches only its own unread rows when the shared `notifications` signal arrives. Clicking a native notification focuses Funnel and opens the issue.
- If **Browser notifications** is off in instance settings, the page does not offer the opt-in and in-app notifications continue to work.

## Settings

Administrators control three instance-wide switches at `/settings/notifications`. They apply to everyone; there are no per-user, per-kind preferences.

| Setting | Default | Effect |
| :--- | :--- | :--- |
| **Notifications** | On | Master switch for all new notification rows: assignments, mentions, watched comments and status/priority/open-closed changes, and new-intake notices. When off, sync diffs and intake staging create nothing. Existing rows, read state and watches are kept, so turning it back on resumes delivery without a backfill. |
| **Browser notifications** | On | Whether the Notifications page offers the browser opt-in and open tabs start the native listener. In-app notifications are unaffected. |
| **New intake submissions** | On | Whether staging a public submission notifies every administrator. It matters only while **Notifications** is on; the submission itself is still staged when either switch is off. |

## Comment coverage

Funnel mirrors the first page of comments per issue (up to 100). Comments, and therefore mentions, beyond that first page are not seen by the notification rules until comment pagination lands. Watching still works for all other changes; only the unseen comments are missed.

## Related

- [Routes and pages](../../reference/routes-and-pages.md)
- [HTTP API](../../reference/http-api.md#notifications)
- [Settings](../../reference/settings.md)
- [Database schema](../../reference/database-schema.md#state_notification)
- [Glossary](../../reference/glossary.md#terms)
