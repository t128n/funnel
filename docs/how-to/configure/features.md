# Set feature flags for this browser

Turn optional cockpit surfaces on or off in your own browser without changing anyone else's experience.

**Settings → Features** is a personal section: every signed-in role (`read`, `write`, and `admin`) can open it. Changes affect only the browser that made them; an administrator toggling a flag here does not change the instance default for other people.

## Before you start

Sign in to Funnel in the browser where you want the override. Changing the deployment default additionally requires access to the server environment.

## How the value is resolved

For each flag, the effective value is:

1. the override stored in this browser's `funnel:features` cookie, if present;
2. otherwise the instance default — `FUNNEL_COMMENT_UI` for chat-style comments, or the built-in registry default for the other flags.

The server resolves the flags on each layout load and passes them to the cockpit. A malformed cookie, an unknown flag key, or a non-boolean value is ignored rather than breaking the page.

## Flags

- **Chat-style comments** (`comment-bubbles`) — renders issue comments as chat bubbles instead of the compact list. Off by default. `FUNNEL_COMMENT_UI=bubbles` makes bubbles the instance default; `compact` keeps the dense list.
- **Internal work notes** (`work-notes`) — shows the internal journal in the issue inspector and the note mode in the composer. On by default. Hiding it does not delete notes or change who may write them.
- **Attachment dropbox** (`attachments`) — shows the file dropbox in the inspector. On by default. Hiding it does not delete stored attachments or change upload permissions.

These flags control visibility, not access control. Server-side role checks and API routes still apply when a surface is hidden.

## Steps

1. Open **Settings → Features**. The toggles show the effective values for this browser.
2. Toggle the flag. There is no Save button; the choice is written to the cookie immediately and the server re-evaluates it.
3. Reload another open tab if it was rendered before the change.

## Troubleshooting

If another browser does not reflect the change, set its override separately. If an override does not persist, check whether the browser allows site cookies; clearing site data also removes the override.

## Change the instance default for comments

Set `FUNNEL_COMMENT_UI` to `compact` or `bubbles` in the deployment environment and restart Funnel. It is read as a deploy-time value and is not editable from the settings UI. Browsers that have an explicit override keep it; everyone else follows the new default.

## Reset a flag to its default

Toggle the flag until it matches the instance default. Funnel removes that key from the cookie, so the browser follows future default changes instead of holding a fixed choice. To reset every flag in this browser, clear the `funnel:features` cookie (or the site's stored data); this affects only that browser.

## After a change

The cookie is written with a one-year lifetime for the site, then the layout data is invalidated so the server resolves the flags again. Other browsers, other people, and the instance defaults are unaffected.

## Related

- [Feature flags reference](../../reference/feature-flags.md)
- [Use work notes and attachments](../use/work-notes-and-attachments.md)
- [Settings reference](../../reference/settings.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
- [Onboard the GitHub App](onboard-github-app.md)
