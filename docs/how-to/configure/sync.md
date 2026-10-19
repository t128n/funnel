# Configure sync

Set how much closed-issue history Funnel keeps and how often it polls GitHub for changes.

Only an administrator can open **Settings → Sync**; other roles receive a 403 on a direct URL, and the save action checks the role again server-side.

## Fields

- **History window (days)** — how far back closed issues are mirrored. Open issues are always included. Default `90`.
- **Active poll (seconds)** — the cadence used while anyone has the cockpit open. Default `30`.
- **Idle poll (seconds)** — the cadence used when no cockpit client is connected. Default `300`.

All three accept a whole number of zero or more. Leaving a field empty fails validation rather than restoring the default.

## Steps

1. Open **Settings → Sync**.
2. Adjust the history window and the two poll intervals.
3. Select **Save changes**.

## How the worker schedules polls

The scheduler starts with the server process and does nothing until repositories are configured. It wakes every five seconds and runs each repository that is due. The interval is chosen for the whole tick from the number of connected SSE clients: one or more open cockpit tabs holding `/api/events` means the **active** interval, otherwise the **idle** interval. Moving between the two needs no restart.

New repositories are given staggered first-due times across one interval, so adding several at once does not produce a burst. A failed repository is logged and isolated; the remaining repositories still run.

## What one cycle does

For each configured repository, Funnel:

1. Resolves the installation id for the repository.
2. Ensures its mirror repository row exists.
3. Refreshes the repository's labels and assignable users.
4. Sends a conditional `GET /repos/{owner}/{repo}/issues` request with `state=all`, sorted by update time, using the stored ETag and a `since` cursor derived from the newest mirrored update.
5. Treats `304 Not Modified` as “nothing changed” and stops there.
6. Hydrates changed issues in GraphQL batches of up to 100, excluding pull requests.
7. Resolves reserved-label conflicts with the App installation token.
8. Publishes an `issues` event to open cockpits.

A repository that fails after its mirror row exists is marked degraded and retried on a later cycle.

## History window and pruning

- Open issues are mirrored regardless of age.
- Closed issues are mirrored only if they were closed within the history window.
- When a poll sees a changed issue that has aged out of the window, its mirror row is deleted.
- Widening the window does not immediately backfill older closed issues, because incremental polls only ask for updates since the cursor. The next full reconciliation picks them up.
- Narrowing the window eventually prunes older closed issues as they are seen or as reconciliation runs.

The history window controls what is mirrored. The board's Done window is a separate presentation setting; see [Configure the board](board.md).

## Nightly reconciliation

Once a day at **03:00 local time** (the server process's time zone; set `TZ` explicitly in production), Funnel sweeps every configured repository:

- performs a full, unconditional listing instead of using the cursor;
- re-hydrates every open issue and every issue closed inside the history window;
- deletes mirror rows for issues that were deleted, transferred away, or have aged out;
- re-provisions the canonical reserved labels;
- records the reconciliation time and clears the degraded flag on success.

The timer re-arms itself after each run.

## Rate-limit considerations

- Conditional `304` responses do not decrement GitHub's REST rate limit, so quiet repositories are cheap.
- The cost scales with the number of repositories and the poll interval: with the active interval at 30 seconds, each repository is checked every 30 seconds.
- Changes cost GraphQL queries, one per 100 issues. A newly added repository may hydrate a large backfill on its first cycle.
- Reconciliation is heavier because it lists and hydrates the full window for every repository; it is deliberately scheduled outside working hours.
- Reserved-label writes are expected to be throttled by the GitHub client to roughly one write per second, so a repository missing many labels converges over several seconds.
- Avoid setting an interval to `0`: it is accepted, but effectively means “every scheduler tick” (about five seconds), which multiplies requests for every configured repository.

## After saving

Funnel revalidates the whole configuration, persists the new values, drops the cached configuration, clears the per-repository schedule, and wakes the scheduler so the next tick re-reads them. A `settings` event refreshes open cockpits. No restart is needed for sync, board, project, or repository changes.

Session idle days is the exception: `session.idle_days` is captured when the Better Auth instance is built, so a change applies to sessions created after a restart (or after the GitHub App credentials are reset and the auth client is rebuilt).

## Related

- [Add or remove repositories](repositories.md)
- [Configure the board](board.md)
- [Settings reference](../../reference/settings.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
