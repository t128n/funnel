# Map labels to projects

Turn GitHub labels into named project sections in the Issues and Inbox feeds.

Only an administrator can open **Settings → Projects**; other roles receive a 403 on a direct URL, and the save action checks the role again server-side.

## Before you start

Sign in as an administrator. Have a configured repository with GitHub labels applied to issues you want grouped; Funnel does not create those labels.

## Add a project

1. Open **Settings → Projects** to see the current mappings.
2. Select **Add project** to create a mapping row.
3. Enter the exact GitHub label that marks membership, for example `project1`.
4. Optionally enter a display name, for example `Project One`. Leave it blank to use the label itself.
5. Repeat for further projects and select **Save changes**. In Issues or Inbox, group by **Project** to check the resulting sections.

Removing a row and saving deletes the mapping. It does not remove the label from GitHub or change any issue.

## How matching works

- Labels are matched against issue labels case-insensitively, so `Project1` on an issue matches a configured `project1`.
- Configured order is preserved in the section list.
- An issue that carries several configured project labels appears in each matching section.
- Issues that match no configured project appear under **No project**, last.
- If no projects are configured, the **Project** option is hidden from the group-by control and a stored project preference falls back to a flat list.
- Only labels already present on issues are useful. Funnel does not create project labels; create and apply them on GitHub as usual.

The mapping is available in the **Issues** and **Inbox** feeds. It does not change the board, filters, or which issues are mirrored.

## Validation

- A label is required and cannot be empty after trimming.
- The display name is optional and is trimmed. An empty name means “use the label”.
- Duplicate labels are ignored case-insensitively: the first configuration wins and the save still succeeds. Duplicates are not reported as errors.

If a section is empty, check that the label is applied to mirrored issues. If **Project** is missing from group-by, save at least one mapping.

## After saving

Funnel writes the mapping into the instance settings and broadcasts a `settings` event, so open feeds re-group without a reload or restart. Changing only a display name changes the section headings; changing a label changes which issues are grouped.

## Related

- [Add or remove repositories](repositories.md)
- [Configure the board](board.md)
- [Create and edit issues](../use/create-and-edit-issues.md)
- [Settings reference](../../reference/settings.md)
- [Reserved labels](../../reference/reserved-labels.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
