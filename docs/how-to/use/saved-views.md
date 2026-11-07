# Save and reuse views

This guide shows you how to save the current Issues or Inbox filters as a named view, share it with the instance, and manage it later.

Sign in and open **Issues** or **Inbox**. Opening views requires `read`; creating or managing them requires `write` or `admin` and the permissions described below.

## Save the current view

1. On `/issues` or `/inbox`, set the filters, search, sort and grouping you want to keep.
2. Select **Views** in the toolbar, then **Save current view…**.
3. Enter a name and, if other people should use it, tick **Share with everyone on this instance**.
4. Select **Save view**.

The view remembers the current query string, sort direction and grouping. The URL is still the live source of truth: after you save, changing a filter affects only the current page until you save or refresh a view again.

Open **Views** again to find the saved preset. If save controls are missing, check your role; if a shared view cannot be edited, ask its owner or an administrator.

## Open a view

Select **Views** and choose a preset. The pinned section appears first, followed by the rest of your views.

- Choosing a view navigates to its Issues or Inbox path with the stored filters.
- Its saved sort and direction are applied, and its grouping is restored in the browser.
- Views belong to one scope: an Inbox view is not offered on Issues and vice versa.

## Share a view

A shared view is visible to every signed-in user on the instance. Only you can edit or delete it; an administrator can also manage a shared view. Personal views stay private to their owner.

To change sharing, open **Views → Manage**, select the pencil beside a view you own, change **Share with everyone on this instance**, and save.

## Pin, refresh, rename, or delete

Open **Views → Manage**. You see controls only for views you may manage.

| Control | Effect |
| :--- | :--- |
| Pin | Moves the view into the pinned section for quick access. |
| Refresh | Replaces the stored filters, sort and grouping with the current page state, keeping the name. |
| Rename | Renames the view or changes its sharing. |
| Delete | Removes the preset. Issues, labels and filters are not affected. |

## Permissions and URL rules

- A `read` user can open personal and shared views but sees no save, refresh, rename or delete controls. The API also rejects mutations from `read` sessions.
- A non-owner `write` user can open a shared view but receives `403` when trying to change it.
- A stored query may contain only the filter keys (plus the Inbox `snoozed` marker). It cannot contain a path, fragment, unknown parameter or another route, so opening a view can never leave the cockpit.
- Sort and direction are stored separately from the query, so opening a view applies its saved order even if the previous URL used a different one.

## Related

- [Routes and pages](../../reference/routes-and-pages.md)
- [HTTP API](../../reference/http-api.md)
- [Database schema](../../reference/database-schema.md)
- [Triage intake submissions](triage-intake.md)
- [Create and edit issues](create-and-edit-issues.md)
