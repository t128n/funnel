# Work notes and attachments

This guide explains how to keep an internal journal on an issue and how to upload, download and remove files in its dropbox.

## Availability and permissions

Work notes and the attachment dropbox appear in the inspector's side column when you open an issue from Issues, the Inbox or the board.

- **Work notes** and **attachments** each have a feature flag. Both default to on. Hide either surface from **Settings → Features**; the choice is stored in your browser, and existing data is retained.
- Creating, editing, deleting or publishing a work note, and uploading or deleting an attachment, requires the `write` role. A `read` user can see work notes and attachments and can download files.
- Work notes and attachments are stored locally by Funnel, keyed by `owner/name` and issue number. They survive mirror pruning and re-sync.
- The repository must already be mirrored before you can add a work note or upload a file. Otherwise the request returns 404.

See [Roles and permissions](../../reference/roles-and-permissions.md) for the role hierarchy.

## Work notes

A work note is an internal journal entry. It is never posted to GitHub unless you explicitly publish it.

### Add a work note

1. Open the issue.
2. In the composer at the bottom of the inspector, choose **Note** instead of **Comment**.
3. Write the note. Markdown is supported.
4. Select the send button or press `⌘`/`Ctrl` + Enter.

The note is stored in Funnel with a snapshot of your author identity. Notes are listed oldest first in the **Work notes** section, with an **Internal** lock marker. The composer's draft is shared between the Comment and Note channels; switching the toggle does not erase what you have typed.

The body must be non-empty after trimming and may be at most 65,536 characters. A failed write leaves the draft in place and reports the error.

### Edit a work note

1. Find the note in the **Work notes** section.
2. Select the pencil icon. The controls are shown when you hold the `write` role and your GitHub login matches the note author.
3. Update the Markdown in the inline textarea.
4. Select **Save**, or **Cancel** to discard the edit.

Save is disabled while the draft is empty. The edit updates the local note only; it does not change anything on GitHub.

### Delete a work note

Select the trash icon on a note you authored. The note is hard-deleted locally with no confirmation dialog and no GitHub change.

### Publish a work note to GitHub

Publishing is a one-way move from the internal journal to the public issue timeline.

1. Select the send icon on a note you authored. Its tooltip reads “Publish to GitHub as a comment (removes the note)”.
2. Funnel posts the note body as a GitHub comment using your user token.
3. On success, Funnel deletes the internal note and shows “Work note published as a comment”.

Publishing cannot be undone from Funnel. The comment is now part of the issue's public activity and the internal note is gone. If posting the comment fails, the note remains in the journal.

Work notes that have been published are not retained locally, so later edits in Funnel cannot rewrite the resulting GitHub comment.

## Attachments

The **Files** section is the issue's dropbox. It stores the file bytes locally and keeps only metadata in the database.

### Upload a file

1. In the **Files** section, drag files onto the dashed drop zone or select **browse**.
2. To upload from the composer instead, use the paperclip button while attachments are enabled.

You can select multiple files. Funnel uploads them one at a time and reports a separate failure for each file that does not upload. The drop-zone button is disabled while uploads are in progress, and the inspector reloads after at least one upload succeeds.

An empty file is rejected. A file larger than `FUNNEL_UPLOAD_MAX_BYTES` (default 10 MiB) is rejected with a 413 response and a message naming the byte limit.

### List and download

Files are listed oldest first with their filename, formatted size, uploader and upload time. Select the download button to fetch the file. Downloads require a signed-in session with at least the `read` role.

The download response carries the original, sanitised filename in `Content-Disposition`, uses the stored MIME type, and sets `X-Content-Type-Options: nosniff` because the uploaded type is untrusted. Files are served as attachments, not rendered inline.

### Delete an attachment

Select the trash icon next to a file. Funnel removes the metadata row and the stored bytes. There is no confirmation dialog and no GitHub change. Deleting requires the `write` role.

## Size limits, storage and filename handling

| Setting | Default | Effect |
| :--- | :--- | :--- |
| `FUNNEL_UPLOAD_MAX_BYTES` | `10485760` (10 MiB) | Maximum size of a single attachment, enforced by Funnel |
| `BODY_SIZE_LIMIT` | `512K` | Maximum request body accepted by the adapter |
| `FUNNEL_UPLOAD_DIR` | `./data/uploads` | Root directory for stored attachment bytes |

`BODY_SIZE_LIMIT` must be larger than `FUNNEL_UPLOAD_MAX_BYTES` when you use the dropbox, with room for the multipart envelope. A request above the adapter limit is rejected before it reaches Funnel, so the user sees a generic request failure rather than Funnel's specific size message.

Uploads are written to a server-generated path of the form `<FUNNEL_UPLOAD_DIR>/<yyyy>/<mm>/<uuid>`. The client filename is never used to build the path, so it cannot escape the upload directory.

Filenames are sanitised before storage:

- control characters, `/` and `\` are removed;
- leading and trailing whitespace is trimmed;
- the result is capped at 255 characters;
- an empty result becomes `attachment`.

The sanitised name is still shown in the UI and echoed on download, where a plain ASCII fallback and a UTF-8 `filename*` value are both supplied.

## Hiding the surfaces

The feature flags are managed in **Settings → Features**:

- **Internal work notes** hides the **Work notes** section and the Comment / Note toggle in the composer.
- **Attachment dropbox** hides the **Files** section and disables the composer's paperclip, which then reads “Attachments coming soon”.

Hiding a surface does not delete any notes or files. Re-enabling the flag makes the existing data visible again. The flags are per-browser overrides; the instance defaults are both on.

## Related

- [The workflow model](../../explanation/workflow-model.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
- [Comments, reactions and mentions](comments.md)
- [Create and edit issues](create-and-edit-issues.md)
- [Keyboard shortcuts](keyboard.md)
