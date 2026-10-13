# Funnel: Product Specification

Status: draft v0.2, written 2026-10-13 after a design interview and a first round of fact-checking. Open items are in section 17.

## 1. What Funnel is

Funnel is a free and open source (AGPL-3.0), self-hosted web app for triaging and tracking GitHub issues. It is a fast, mouse-first visual layer over GitHub for **one team per instance**, with issues aggregated across repos and orgs.

**Priorities, in order:** speed, UX, developer experience.

**Core principle:** GitHub is the source of truth. Funnel keeps a disposable cache of GitHub data and a very small amount of durable state of its own.

## 2. Principles

1. **GitHub owns the data.** Issues, comments, labels and assignees live on GitHub. Anything Funnel can't rebuild from GitHub is a liability and needs a strong reason.
2. **No invented permissions.** Whatever GitHub lets a user do is what they can do in Funnel. There are no Funnel roles.
3. **Opinionated first.** Funnel enforces a small, fixed label vocabulary. Configuration comes later and only where unavoidable.
4. **One instance, one team.** Several teams means several instances.
5. **Reads are local, writes are honest.** Every view is a query against a local mirror. Writes go to GitHub and show up only once GitHub confirms.
6. **Small MVP.** Anything that adds state, a sync path or a new concept waits until the core feels good.

## 3. Scope

### 3.1 In scope for the MVP

- Inbox (pending intake submissions plus untriaged GitHub issues)
- All issues, My issues, and a status board, with six filters and text search
- Issue detail: edit title and body, add comments, close and reopen
- Create issue dialog
- Public intake: JSON endpoint and no-JavaScript web form
- GitHub login, a GitHub App with a one-time `/setup` page
- Self-healing provisioning of the reserved labels
- Polling-based sync with a local mirror
- Desktop-first UI with system light/dark theme and a plain narrow-screen fallback

### 3.2 Post-MVP (deferred, not rejected)

- **Cycles.** The model is undecided (labels? config dates?). Do not design it into the MVP.
- Saved views, query syntax (GitHub-style qualifiers, "all of" label matching), filter chips
- Bulk triage actions and undo
- Markdown rendering (GFM, sanitized, `#123` and `@user` links)
- Command palette and keyboard shortcuts
- Drag and drop on the board, manual ordering
- Activity timeline on issue detail
- **Linked-PR summaries** on cards and issue detail. Options when it comes back: fetch them lazily for one issue when its detail opens, or hydrate them in a separate, smaller query (25-30 issues per batch) so a timeout can't fail the main batch. Webhook ingestion is not an option, since Funnel is polling-only.
- Per-user visibility (filter the mirror by each user's GitHub access)
- Gate on Dismiss (write access required)
- Abuse controls on intake: rate limiting, API keys, captcha, bulk dismiss
- PR-driven status automation (for example PR opened means `in-review`)
- Targeted label operations and freshness checks on text edits (concurrency safety)
- Optimistic UI with rollback
- Editing and deleting comments, issue templates, sub-issues, milestones, reactions, transfer, lock, delete
- Status page, health endpoint, metrics
- Docker image and other packaging, standalone binaries
- Postgres
- Speed budgets enforced in CI
- Mobile-first design, localization, PWA, offline mode
- Startup guard against exposing private repos
- A fake GitHub for contributor development and tests

### 3.3 Anti-features (never)

- A second source of truth. Funnel never owns issues.
- Funnel-specific permissions, roles, teams or ACLs.
- Telemetry of any kind: analytics, phone-home, update checks, error reporting to third parties.
- Support for other trackers (GitLab, Jira, Linear import, export or sync).
- Multi-team instances or a team switcher.
- Workspace-suite features: built-in chat, docs, wiki, time tracking, AI features.
- Funnel-owned ordering ranks or global issue IDs. Both would be state GitHub can't rebuild.

**Test for future requests:** does this require Funnel to own data GitHub can't rebuild, or to grant permissions GitHub doesn't know about? If yes, the answer is no.

## 4. Architecture

- **One process.** SvelteKit on Bun (server rendering on first load, client takeover afterwards). The sync loop runs as a background task in the same process. No queue, no Redis, no worker service.
- **Two SQLite files** (`bun:sqlite`):
  - `mirror.db`: disposable cache of GitHub data (section 6).
  - `state.db`: durable state (section 7). It is the only file that needs a backup.
- **Live updates** to open browsers via server-sent events (SSE). No WebSocket server. SSE requirements on Bun:
  - Responses use `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, and are never compressed.
  - Chunks are written as `TextEncoder`-encoded bytes, and the stream's `cancel()` handler releases the connection's resources.
  - **Heartbeat required:** Funnel sends a comment line (`: ping`) about every 10-15 seconds on every SSE connection, because Bun can drop idle connections after a short idle timeout. Funnel uses the official `svelte-adapter-bun`.
  - The README tells operators who run a reverse proxy to disable response buffering and compression for the SSE path (for example nginx `proxy_buffering off` and a long `proxy_read_timeout`).
- **GitHub access:** Octokit. REST for change detection and writes, GraphQL for hydration (section 6.2).
- **Deployment:** from source. One process, two files on disk. Network separation (what is exposed publicly) is the operator's job.

## 5. Identity, labels and the GitHub contract

### 5.1 Issue identity

An issue is identified by GitHub's own identity, `org/repo#number`. Funnel keeps no ID mapping and no counters.

- Display shortens to `repo#123`, adding the org (`orgA/api#123`) only when two configured orgs have a repo of the same name.
- Funnel URLs follow GitHub's shape: `/:org/:repo/issues/:number`.
- Repos are tracked by GitHub's numeric repo ID internally, so renames don't break anything.

### 5.2 Reserved labels (the label contract)

Funnel owns these plain label names in every configured repo. This list is the contract that scripts and other tools can rely on:

| Group    | Labels                                                   | Meaning of "no label" |
| -------- | -------------------------------------------------------- | --------------------- |
| Priority | `p1`, `p2`, `p3`                                         | no priority           |
| Size     | `s`, `m`, `l`                                            | unestimated           |
| Status   | `backlog`, `todo`, `in-progress`, `in-review`, `blocked` | **untriaged** (inbox) |

Rules:

- **At most one label per group per issue.** If an issue has two labels from the same group, Funnel finds out which was added last from the issue's label-event timeline, keeps that one, and removes the other. The removal is made by the GitHub App, so it is visible on the issue timeline. If the timeline can't settle it (same event, truncated history), Funnel keeps the lower-priority or earlier-workflow value and flags the issue in the UI.
- **Closed state wins.** A closed issue is _Done_ (closed as completed) or _Canceled_ (closed as not planned), whatever status label it still carries. Funnel never touches labels when an issue closes. Reopening makes the old status label valid again, and an issue that never had one lands in the inbox.
- **`blocked` replaces the previous status.** Funnel does not remember what the issue was before.
- **Provisioning is self-healing.** At startup and in the nightly reconciliation, Funnel creates any missing reserved label with a canonical color and description, and restores edited colors and descriptions. A renamed label counts as missing, so the canonical name is recreated and the renamed one is left alone as an ordinary label. If the App can't write labels in a repo, that repo is **degraded**: readable, never written to by Funnel, logged as a warning.
- **No automation.** Status changes only when a human changes it.

### 5.3 Other labels

Every non-reserved label is used as-is. Funnel has no module or domain concept. A monorepo's `domain1`, `domain2` labels are simply labels. Funnel never creates, enforces or corrects them. They are filterable (section 9.3) and editable on issues like any label.

### 5.4 Assignees

Multiple assignees are allowed, GitHub-native, with no enforcement. "Assigned to me" means "I am one of the assignees".

## 6. Mirror and sync

### 6.1 What the mirror stores (`mirror.db`)

- Issues: title, body, state and close reason, labels, assignees, author, timestamps, milestone name
- Issue comments
- Each repo's label set
- Logins and avatar URLs that appear on mirrored issues
- The FTS5 full-text index over titles, bodies and comments

**Not mirrored:** PRs as first-class objects, **linked-PR summaries** (see section 3.2), reviews, diffs, CI checks, commits, discussions, Projects, reactions, attachments, timeline events.

**History window:** all open issues plus issues closed within `sync.history_days` (default 90). Older closed issues are not mirrored. A Funnel URL for one shows "Not synced, open on GitHub". Nothing already mirrored is pruned by age. A reopened old issue comes back through polling.

**Schema versioning:** a single version number. If the file's number differs from the running version, Funnel deletes `mirror.db` and re-syncs. There is no migration code for the mirror. The first sync shows progress per repo, and a repo is usable as soon as its open issues are loaded.

### 6.2 Sync mechanics

- **Change detection:** REST `GET /repos/{org}/{repo}/issues?since=…&sort=updated` with the ETag from the previous response. An unchanged repo costs a 304. Entries with a `pull_request` key are skipped.
- **Hydration:** changed issues are fetched in batches (one GraphQL query per 100 issues) for body, labels, assignees and the first page of comments (10-20 per issue). An issue with more comments than one page is completed with follow-up paged queries. The initial backfill uses the same batched query.
  - GitHub computes GraphQL cost from the _declared_ page sizes, not the rows returned: 100 issues with 10 comments each is about 1,100 nodes, which costs about 11 points, and the query is fast and deterministic.
  - **No timeline traversal in the batch.** Resolving timeline items (for linked PRs) across 100 issues in one query risks GitHub's roughly 10-second GraphQL timeout, which would fail the entire batch. That is why linked-PR summaries are not part of the MVP.
- **Cadence:** about every 30 seconds per repo while at least one user has Funnel open, backing off to about 5 minutes when nobody is connected. Both values are config settings.
- **Refresh-on-write:** every successful write triggers an immediate re-fetch of that issue.
- **Live updates:** changes found by polling are pushed to open browsers over SSE.
- **Nightly reconciliation:** a full comparison per repo drops mirror rows for issues that no longer exist (deleted, transferred), re-checks reserved labels (section 5.2), and warns when a config entry uses an outdated repo name. Between reconciliations, a vanished issue can linger for up to a day. A failed write against it removes the row.
- **Rate limits:** Funnel honors `Retry-After` and the rate-limit reset headers, pauses polling until the reset, and logs the pause. Writes during a pause fail with GitHub's message.
- **GraphQL budget:** GraphQL is rate-limited in normalized points per hour, not in requests. For a GitHub App installation the base is 5,000 points per hour, scaling up to 12,500 with the number of repos and users. Enterprise Cloud has higher limits (10,000-15,000). User-to-server (OAuth) tokens get 5,000. Consequences for the design:
  - Hydration (installation token) is the only background GraphQL use. REST with ETags handles the cheap, frequent change detection, so steady-state GraphQL cost is proportional to how many issues actually changed.
  - The **initial backfill is the expensive part**. The batch size (default about 100 issues per query) must be tunable, and the backfill pauses when the budget is exhausted and resumes at the reset, with progress shown per repo.
  - The expected hydration cost is about 11 points per batch of 100 issues (section 6.2, Hydration), so a full backfill of 50,000 issues is on the order of 5,500 points. That is a bit more than one hour of base budget, so the pause-and-resume behavior above will be hit on very large first syncs. Verify the figure against a real repo.
  - Budgets belong to the installation, so an instance spanning several orgs has one budget per org.
- **REST budget:** an installation token has its own primary limit of 5,000 requests per hour, plus 50 per hour for each repo or user beyond 20, up to 12,500. Installations owned by a GitHub Enterprise Cloud organization get a flat 15,000.
  - **304 responses are free.** A conditional request that returns 304 Not Modified does not decrement the primary limit, which is what makes 30-second polling affordable.
  - **Secondary limits still apply to 304s** (about 900 REST points per minute, plus concurrency limits). Funnel therefore staggers the per-repo polls instead of firing them together, and caps concurrent requests to GitHub.
- **Repo changes:** archived repos stay in the mirror and the UI hides write controls for them. A repo the App can no longer access is treated as degraded and its data is kept, unmodified, until the operator removes it from the config. Removing a repo from the config purges its data at the next start.

## 7. Durable state (`state.db`)

Forward-only SQL migrations run at startup. Contents:

- **Pending intake submissions:** `id`, `title`, `body`, optional `source`, `created_at`. A decision deletes the row immediately. Nothing is kept afterwards, and there is no undo.
- **Better Auth tables:** users, accounts, sessions, and stored GitHub tokens.

Backup guidance for operators: back up `state.db` only. Treat `mirror.db` as a cache.

## 8. Authentication and permissions

- **GitHub App**, installed on each org. Funnel itself has no roles.
- **Login:** GitHub only, through **Better Auth** with its GitHub provider. **Any GitHub user who can sign in gets access.** Sessions are server-side, with the user-to-server token stored in `state.db`. Sessions expire after `session.idle_days` (default 30) of inactivity, and logout deletes the session.
- **Token refresh (required):** GitHub App user-to-server tokens are short-lived. Funnel refreshes them with the stored refresh token before a write whenever the access token is expired or about to expire, and a failed refresh sends the user back to login. If Better Auth doesn't do this for the GitHub provider, Funnel implements the refresh step itself.
- **Encryption at rest (required):** access and refresh tokens are stored encrypted with a key derived from `FUNNEL_SECRET`. If Better Auth can't do this natively, Funnel encrypts the token fields before they reach the database. Changing `FUNNEL_SECRET` makes stored tokens unreadable and signs everyone out, which is acceptable because sessions are disposable.
- **Reads:** instance-wide. Everyone signed in sees everything in the mirror (see section 15, known risks).
- **Writes:** use the signed-in user's own token, so GitHub shows them as the actor and enforces write access. The App's installation token is used for background sync and for the label corrections and provisioning done by `funnel[bot]`.
- **First-run setup:** while the App credentials are missing from the environment, `/setup` runs GitHub's App manifest flow (name, minimal permissions, callback URL derived from `FUNNEL_URL`, no webhook) and shows the resulting credentials once as an env block. Once the credentials are set, `/setup` returns 404.
- **Required App permissions:** Issues (read and write), Metadata (read). Funnel verifies at startup that each listed repo is reachable through an installation and logs exactly which ones aren't.

## 9. Features

### 9.1 Navigation

A sidebar with fixed entries: **Inbox**, **My issues**, **All issues**, **Board**. The footer links to the project's source repository (AGPL §13). There is no command palette and no keyboard shortcuts in the MVP. Every action is a visible control, and bits-ui supplies arrow-key and Esc behavior inside dropdowns and dialogs.

### 9.2 Inbox

The inbox holds everything that needs a decision:

1. **Pending intake submissions** (from Funnel's DB)
2. **Open GitHub issues with no status label** (from the mirror)

There is no special onboarding. A newly added repo's unlabeled open issues all land here. Triage is **single-item**, with no multi-select, bulk actions or undo.

Every item has three actions:

| Action        | On an intake submission                                                                                             | On a GitHub issue                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Accept**    | Creates a GitHub issue (repo picker pre-filled with `intake.default_repo`), applies chosen labels, deletes the row. | Opens a panel for status (default `backlog`), priority, size, assignee. Setting a status removes it from the inbox. |
| **Dismiss**   | Deletes the row. Nothing goes to GitHub.                                                                            | Closes the issue as not planned.                                                                                    |
| **Duplicate** | Pick an existing issue (search the mirror). Posts the submission text as a comment on it, then deletes the row.     | Pick an existing issue. Posts "Duplicate of org/repo#N" as a comment, closes as not planned.                        |

**Provenance:** an issue created from a submission ends with `_Submitted via Funnel intake (source: …)_` (the source part omitted when empty). Duplicate comments start with `Submitted via Funnel intake:` followed by the quoted text. Provenance is plain text only, with no label or stored link. The triager can edit it away.

Anyone signed in can Dismiss any pending submission. See section 15.

### 9.3 Filters and search (All issues, My issues, Board)

Six multi-select dropdowns, one free-text search field, and the whole state in the URL (so views are bookmarkable and shareable):

| Dropdown | Values                                                                                      |
| -------- | ------------------------------------------------------------------------------------------- |
| Repo     | configured repos                                                                            |
| Status   | the five status labels, plus _Done_ and _Canceled_                                          |
| Assignee | people seen in the mirror, with **Me** pinned first                                         |
| Priority | `p1`, `p2`, `p3`, plus "none"                                                               |
| Size     | `s`, `m`, `l`, plus "none"                                                                  |
| Labels   | every non-reserved label in the configured repos (same name in several repos counts as one) |

Values within one dropdown combine as **OR**. Different dropdowns combine as **AND**. Text search uses SQLite FTS5 over titles, bodies and comments. _My issues_ is All issues with Assignee set to Me.

**Sorting:** default priority (`p1` first, unprioritized last), then most recently updated. Users can switch to updated, created, size or title. There is no manual ordering.

### 9.4 Board

- **Columns:** Backlog, Todo, In Progress, In Review, Blocked, Done. Canceled is not a column. Untriaged issues appear in the Inbox, not on the board.
- **Done** shows issues closed as completed within `board.done_days` (default 14).
- **Cards** show `repo#number`, the title, priority, size and assignee avatars. They are sorted by priority within a column.
- **Changing status** is done with a **status dropdown on each card**. There is no drag and drop.
- The same six filters apply.

### 9.5 Issue detail

- Shows title, body, comments (each with author and time), state, labels and assignees. Body and comments are **plain text** with line breaks preserved. There is no markdown rendering.
- **Editable:** title and body (inline, plain text), labels and assignees (same pickers as the create dialog), status, priority and size.
- **Comments:** adding is supported. Editing and deleting are not.
- **Close and reopen:** _Close as completed_ (Done), _Close as not planned_ (Canceled), _Reopen_.
- **Everything else** (linked PRs, transfer, delete, lock, pin, reactions, sub-issues, milestones, timeline and history) is available through an **Open on GitHub** link.
- Images in bodies are not rendered. Image links show as text.

### 9.6 Create issue

A "New issue" button opens one compact dialog:

- **Repo** (pre-filled with the current view's repo, or `intake.default_repo`), **title**, **body** (plain text).
- Optional: status, priority, size, assignee(s), labels.
- **Status defaults to `backlog`.** The dropdown also offers "None (send to inbox)".
- One GitHub call creates the issue with its labels and assignees. When GitHub confirms, the dialog closes and the app navigates to the new issue.
- GitHub issue templates are ignored.

### 9.7 Write behavior

- **Pessimistic UI:** nothing changes on screen until GitHub confirms. The control that was clicked shows an inline spinner and is disabled meanwhile, so a double click can't send two writes. On failure, an error with GitHub's message appears at the control. There is no rollback logic, no retry queue and no background retries.
- **Last-write-wins:** a label write sends the full label set and a text edit overwrites the text, with no freshness check. A stale tab can undo labels changed elsewhere in the last ~30 seconds. This is a known limitation (section 15).
- After a confirmed write, the mirror re-fetches that issue (section 6.2).

## 10. Intake

### 10.1 API

`POST /api/intake` with `Content-Type: application/json`:

```json
{
  "title": "string, required, max 200 chars",
  "body": "string, optional, max 10000 chars",
  "source": "string, optional, max 50 chars, free text, untrusted"
}
```

- `201 {"id": "…"}` on success. `400` with a field-level message on invalid input. `413` when over the limits. Unknown fields are ignored.
- **Open CORS** (`Access-Control-Allow-Origin: *`) on this path only, so any website or script can post to it from a browser. No other Funnel path sends CORS headers.
- **No authentication, no API keys, no rate limiting** in the MVP. There is no email or contact field and no reply channel to the submitter. There is no status endpoint.
- Text is stored as given and displayed as plain text. Nothing is rendered as HTML.
- This is the **only API Funnel promises to keep stable**. Changes are versioned in this document.

### 10.2 Web form

`/submit` is a plain HTML `<form>` that works without JavaScript. It posts to the same handler as the API and shows a thank-you page. It asks for title and description and shows one line of notice that the text may be published as a GitHub issue. It never shows or asks for a repo.

### 10.3 Routing

Accepted submissions go to `intake.default_repo`, and the triager can change the repo in the picker. If `default_repo` is unset, the triager picks a repo every time.

## 11. Configuration

`funnel.config.yaml` (repos and settings) plus environment variables (secrets and URLs). Config is not editable from the UI.

```yaml
github:
  url: https://github.com # web host (OAuth, "Open on GitHub" links)
  api_url: https://api.github.com # API host (Octokit)

repos: # explicit list, no wildcards
  - orgA/api
  - orgA/web
  - orgB/infra

intake:
  default_repo: orgA/api # optional

sync:
  history_days: 90
  poll_interval_active_seconds: 30
  poll_interval_idle_seconds: 300

board:
  done_days: 14

session:
  idle_days: 30
```

Environment variables: `FUNNEL_URL`, `FUNNEL_SECRET` (Funnel refuses to start without it), the GitHub App credentials (`GITHUB_APP_ID`, client ID, client secret, private key), and the log level.

Only github.com is tested. GHES and GHE.com are best-effort through the two host settings. If a host lacks an endpoint Funnel needs, startup fails with an error naming that endpoint.

## 12. UI and UX

- Desktop-first, keyboard and mouse. A sidebar and a main pane.
- Light and dark follow the system setting through CSS design tokens. There is no in-app toggle or custom themes.
- Below about 800 px the sidebar collapses to a menu, the layout becomes one column, and the board scrolls horizontally. It is usable for a quick look but not designed or tested as a mobile experience.
- Use bits-ui for behavior and accessibility and do not build custom components for things it already provides. Do not over-engineer the shell.
- English only. No offline mode, PWA or native apps.

## 13. Operations

- **Logs only.** One JSON line per event to stdout (sync cycles, errors, label corrections, writes, rate-limit pauses, degraded repos, startup validation results). Logs never contain tokens or submission text. The level is set by an environment variable.
- There is no status page, health endpoint or metrics endpoint in the MVP.
- **Public surface:** exactly two route groups are meant to be reachable by outsiders, `/submit` and `/api/intake`. Everything else is the internal app. The README tells operators to put the app behind a reverse proxy, VPN or firewall and expose only those two prefixes. Funnel has no internal-mode switch and no IP checks.
- **Speed:** every view change is a local query, and writes are bounded only by GitHub's round trip. There are no numeric budgets or CI checks in the MVP. The intended instance is a team's worth of repos, not an enterprise.

## 14. Tech stack, tooling and release

- **Runtime and framework:** Bun, SvelteKit (Svelte 5), TypeScript. The build uses the official **`svelte-adapter-bun`**, and the production server runs under Bun (`bun ./build/index.js`, wrapped as `bun run start`). A Bun-specific adapter is deliberately not used.
- **Data:** `bun:sqlite` with FTS5. Plain SQL migrations for `state.db`.
  - FTS5 is compiled into `bun:sqlite` and needs no `loadExtension()` call. Use an external-content FTS5 table over the issue and comment tables, to avoid storing the text twice.
  - **macOS:** `bun:sqlite` uses Apple's SQLite build by default, which cannot load extensions. FTS5 doesn't need loading, but if a given macOS SQLite build turns out to lack it, point Bun at a Homebrew build with `Database.setCustomSQLite("/path/to/libsqlite3.dylib")` before the first database is opened. This is a no-op on other systems. The README documents it for contributors.
  - Funnel runs a one-time FTS5 self-check at startup and fails with a clear message if FTS5 is unavailable (an implementation note, not a user-facing feature).
- **GitHub:** Octokit (REST and GraphQL).
- **Auth:** Better Auth with the GitHub provider. Better Auth documents a built-in Bun SQLite adapter (`bun:sqlite`), which is what `state.db` uses.
- **UI:** bits-ui (unstyled), plain CSS with design tokens, no component library.
- **Tooling:** `bun test`, oxlint, oxfmt.
- **Contributor setup:** every contributor creates a GitHub App and a test org (the `/setup` page does most of it). There is no fake GitHub. Tests that touch GitHub need network and secrets, so CI can't run them for pull requests from forks. Keep pure logic (label-conflict resolution, filter-to-SQL, sort order) in plain functions so it can be tested offline.
- **License:** AGPL-3.0. The footer's source link covers §13 for operators running modified versions. Dependency licenses are to be checked when versions are pinned. This is not legal advice.
- **Distribution:** source only. Quick start is `git clone`, `bun install`, `bun run build`, `bun run start`, plus a process manager of the operator's choice. Upgrades are `git pull`, rebuild and restart. `state.db` migrates itself and `mirror.db` rebuilds itself. Releases are git tags with a changelog and semver. Any change to the config file or the label contract is a breaking, major-version change.

## 15. Known risks and accepted limitations

These are deliberate MVP trade-offs. Each should appear in the README in plain words.

1. **Private-repo exposure.** Login is open to any GitHub user and reads are instance-wide. Anyone who can sign in can see every mirrored repo, including private ones they couldn't open on GitHub. Funnel has no startup guard. Operators must only list repos whose audience is the whole team, and keep the instance unreachable by strangers (except for the two intake paths) unless every repo is public.
2. **Anyone signed in can Dismiss** any pending submission, with no undo, and the inbox can be emptied that way.
3. **Intake is open to abuse.** The endpoint has no authentication, rate limiting or captcha, so the inbox can be flooded, and cleanup is single-item. Rate limiting, API keys and bulk dismiss are the first hardening steps.
4. **Last-write-wins.** A stale browser tab can silently undo a teammate's label change from the last ~30 seconds. Concurrent text edits overwrite each other.
5. **Tests.** GitHub-backed tests can't run on CI for fork pull requests.
6. **Staleness.** Data can be up to ~30 seconds old (active polling), 5 minutes when idle, and deleted or transferred issues can linger up to a day.
7. **Rendering gaps.** Markdown isn't rendered, and images in issue text don't display.
8. **GHES and GHE.com** are best-effort and untested.

## 16. Decision summary

| Topic              | Decision                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Source of truth    | GitHub. Funnel stores only a mirror and a little durable state.                                           |
| Team model         | One instance is one team. Repos are an explicit list, possibly across orgs.                               |
| Metadata storage   | Plain-name labels. No Projects v2, no issue fields.                                                       |
| Reserved labels    | Priority `p1-p3`, size `s/m/l`, status `backlog/todo/in-progress/in-review/blocked`.                      |
| Modules or domains | None. Existing labels are used as-is.                                                                     |
| Status on close    | Closed state wins. Labels untouched.                                                                      |
| Conflicts          | Last-added label wins. Bot removes the other.                                                             |
| Automation         | None in the MVP.                                                                                          |
| Sync               | Polling only. REST with ETags for detection, GraphQL to hydrate. No webhooks.                             |
| Mirror             | Issues, comments and labels. Open issues plus 90 days of closed. No linked-PR summaries in the MVP.       |
| Storage            | Two SQLite files: disposable `mirror.db`, durable `state.db`. SQLite only.                                |
| Auth               | GitHub App and Better Auth. Open login, instance-wide visibility, user tokens for writes.                 |
| Intake             | Anonymous JSON endpoint and no-JavaScript form. No email. Delete-on-decision. Accept, Dismiss, Duplicate. |
| Inbox              | Pending submissions plus open issues without status. Single-item triage.                                  |
| Filters            | Six multi-select dropdowns plus FTS5 text search, state in the URL.                                       |
| Board              | Six columns, status dropdown on cards, no drag and drop.                                                  |
| Writes             | Pessimistic UI, last-write-wins.                                                                          |
| Rendering          | Plain text. No markdown.                                                                                  |
| UI shell           | Desktop-first, system theme, no palette, no shortcuts, bits-ui.                                           |
| Operations         | Logs only. Source-only distribution. Soft speed goals.                                                    |
| Stack and license  | SvelteKit, Bun, TypeScript, `bun:sqlite`, Octokit, bits-ui, plain CSS. AGPL-3.0.                          |

## 17. Open items to verify before implementation

- **GitHub rate limits (resolved, one measurement left).** REST and GraphQL budgets, free 304s and secondary limits are in section 6.2. Linked-PR summaries are out of the MVP because of the GraphQL timeout risk. Still to do: measure the real point cost and latency of the 100-issue hydration query (issues plus the first page of comments) against a large repo, and tune the batch size and comment page size from that.
- **Better Auth (design decided, implementation to verify).** A Bun SQLite adapter is documented. Token refresh and at-rest encryption are **required** (section 8). Still to check: whether Better Auth's GitHub provider already refreshes GitHub App user tokens and can encrypt token fields. Where it can't, Funnel implements both itself.
- **FTS5 in `bun:sqlite` (resolved, with a macOS caveat).** FTS5 is built in and needs no extension loading. The macOS note and the startup self-check are in section 14.
- **SvelteKit on Bun (decided, one test left).** The adapter is the official `svelte-adapter-bun` run under Bun. SSE requirements, including the mandatory heartbeat, are in section 4. Still to do: test that an SSE stream stays open and delivers events through `svelte-adapter-bun` under Bun, with and without a reverse proxy in front.
- **Dependency licenses:** check compatibility with AGPL-3.0 when versions are pinned.
- **Cycles:** decide the model (post-MVP).
- **Confirmed after the interview:** the `board.done_days` default of 14, the board card contents (without linked-PR state), and the environment variable names are accepted as written. Label colors and descriptions are accepted as proposed and picked at implementation time.
