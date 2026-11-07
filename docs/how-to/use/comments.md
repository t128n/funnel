# Edit, delete, react to, and mention people in comments

This guide shows you how to manage the public conversation on an issue: edit or delete your own GitHub comments, add and remove reactions, and mention repository collaborators with `@login`.

## Availability and permissions

Comments appear in the **Activity** section of an issue, oldest first. Funnel mirrors them from GitHub and renders the Markdown as sanitized HTML.

- Reading comments requires the `read` role.
- Editing, deleting and reacting require the `write` role.
- **GitHub decides who may write.** Funnel offers Edit on your own comments and Delete on your own comments, plus Delete on any comment for Funnel admins. The server still forwards the request with your GitHub token, so GitHub rejects an edit or delete you are not allowed to make even when the button was visible.
- A repository must already be mirrored before the issue and its comments are available.
- Internal work notes are separate from public comments. See [Work notes and attachments](work-notes-and-attachments.md) for the local journal.

See [Roles and permissions](../../reference/roles-and-permissions.md) for the role hierarchy.

## Edit a comment

1. Open the issue.
2. Find the comment in **Activity**. The **Edit** action only appears on a comment whose author login matches your GitHub login.
3. Select **Edit**. The rendered body becomes a textarea holding the original Markdown.
4. Change the text and select **Save**, or **Cancel** to leave it untouched.

The body is trimmed and must be non-empty; the maximum is 65,536 characters. Funnel shows the new text immediately, then replaces that preview with freshly rendered Markdown when the issue reloads. If GitHub refuses the write, the previous text is restored and the error appears below the issue header.

## Delete a comment

Select **Delete** on a comment you wrote. Funnel admins also see Delete on other people's comments, but GitHub still applies its own repository-permission check.

The comment disappears from the timeline immediately. On success, Funnel reloads the issue from the refreshed mirror; on failure, the comment is restored and the error is shown. There is no confirmation dialog, and a deleted GitHub comment cannot be restored from Funnel.

Clearing a comment is different from deleting it: an empty body is rejected by the client and the server.

## React to a comment

Every comment shows a chip for each reaction somebody left, plus a smiley button that opens the reaction picker.

1. Select the smiley button on a comment.
2. Choose one of the standard reactions: 👍 `+1`, 👎 `-1`, 😄 laugh, 😕 confused, ❤️ heart, 🎉 hooray, 🚀 rocket or 👀 eyes.

To remove a reaction you left, select its filled chip again, or open the picker and choose the same reaction. Counts update immediately and are reconciled with GitHub after the background refresh.

Funnel stores the signed-in user's own choices locally so the filled chips survive a page reload. The aggregate counts come from GitHub. A reaction you add directly on GitHub is included in the count but does not fill the local chip until you toggle that reaction in Funnel.

If GitHub refuses the reaction, the counts are rolled back and a clear error is shown.

## Mention a person

The comment composer autocompletes `@logins` from the repository's assignable users.

1. Start typing `@` followed by part of a login.
2. Use `↑` and `↓` to move through the suggestions, then `Enter` or `Tab` to insert the highlighted login, or click it.
3. Press `Escape` to close the menu without changing the draft.

The inserted text is the plain `@login` token. Funnel preserves mention text when rendering Markdown; it does not rewrite it into a link, so the comment matches what GitHub receives. The same autocomplete is available for internal work notes.

To notify someone in the public conversation, keep **Comment** selected and submit the draft. The comment appears in **Activity** after a successful write. If a suggestion is missing, you can type the login directly; if posting fails, check the inline error and your GitHub permissions before retrying.

Typing an email address such as `me@example.com` does not open the menu, because the `@` is not at the start of a word.

### Still supported in the composer

- `⌘`/`Ctrl` + `Enter` posts the draft.
- The Comment / Internal note switch chooses the channel; switching does not discard the draft.
- The paperclip attaches files when the attachment dropbox is enabled.

## How refreshes and failures work

Every comment write, delete and reaction is applied optimistically in the issue view. Funnel then asks GitHub to perform the change and schedules a single-issue refresh so the mirror catches up. When the write fails, the optimistic change is rolled back and the error is shown inline; a GitHub permission refusal names the action and comment.

Comment mutations use their own in-flight identity (`comment:<id>`), separate from the work-note identity (`note:<id>`). Editing a public comment can never accidentally target an internal note id, and publishing a note still removes the note and creates a comment.

## Related

- [Work notes and attachments](work-notes-and-attachments.md) — keep an internal journal and the file dropbox.
- [Create and edit issues](create-and-edit-issues.md) — edit the issue itself.
- [Keyboard shortcuts](keyboard.md) — global and board bindings.
- [HTTP API](../../reference/http-api.md#comments) — the comment and reaction endpoints.
- [Roles and permissions](../../reference/roles-and-permissions.md)
- [Read issue history](issue-history.md) — review the changes around the conversation.
- [Use notifications](notifications.md) — follow mentions and watched issues.
