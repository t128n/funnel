# Manage people and roles

Assign instance-wide roles so each person can view, edit, or administer Funnel.

**Settings → People** is administrator-only. The page load and the role-change action both enforce the `admin` role server-side; a direct URL from another role returns a 403, and the section is filtered out of the settings navigation.

## Before you start

Sign in as an administrator and ask the person to sign in once with GitHub so their account appears in the list.

## Roles

Funnel has three roles, ranked `read` < `write` < `admin`:

- **Read** can view the cockpit, board, inbox, attention list, and realtime updates, and manage their own account, appearance, and feature flags.
- **Write** can do everything read can, plus every mutation: issues, comments, labels, work notes, attachments, and intake triage.
- **Admin** can do everything write can, plus workspace settings, system settings, the GitHub App, and this page.

The full capability matrix is in [Roles and permissions](../../reference/roles-and-permissions.md).

## Who becomes an administrator

- The first account to sign in becomes an administrator, so a fresh instance always has an owner.
- Every later account starts as `read`.
- People appear in the list after they sign in with GitHub. There is no separate invitation flow on this page.

## Change a role

1. Open **Settings → People**. Signed-in accounts appear with their current roles.
2. Find the person. Your own row is marked **(you)**.
3. Choose **Read**, **Write**, or **Admin** in their role selector.
4. Select **Save**. A success toast confirms the change.

Promotion takes effect on that person's next request: every page load, form action, and API route reads the stored role server-side. The UI only mirrors the role, so reloading is not required for enforcement, although an open page may keep rendering its previous controls until it navigates or refreshes.

## Last-administrator protection

Funnel refuses to demote the last administrator. If an admin is changed to read or write while only one admin exists, the action returns 409 with **At least one administrator is required** and the role is left unchanged. Promote another person to admin first, or keep at least one admin.

You may demote yourself when another administrator exists. Your access to settings is then removed on the next request.

## Validation and errors

- An unknown user id returns 404.
- A role outside `read`, `write`, and `admin` is rejected with 400.
- If authentication is not configured, the action returns 503.
- A failure from the authentication layer is surfaced as 502 with its message.

## GitHub login is best-effort

The list always shows each account's name and avatar, and then either their `@login` or their email. The `@login` line comes from the mirrored GitHub users table, matched by the account's numeric GitHub id. Someone who has never authored, been assigned, or otherwise appeared on a mirrored issue may not have a mirror row yet, so the page falls back to their email instead of a login. This affects display only; it does not change their role or access.

## Related

- [Roles and permissions](../../reference/roles-and-permissions.md)
- [Triage intake](../use/triage-intake.md) — a task available to writers.
- [Onboard the GitHub App](onboard-github-app.md)
- [Settings reference](../../reference/settings.md)
