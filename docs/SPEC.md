# Funnel: Authoritative Specification

**Status:** Authoritative v1.0 (settled via Design Interview, October 2026)  
**License:** AGPL-3.0  

---

## 1. Product Definition & Vision

**Funnel** is a high-density, mouse-first triage cockpit for GitHub issues across multiple repositories and organizations. It provides a sub-100ms visual layer over GitHub for **one team per instance**.

### Core Priorities
1. **Speed**: Sub-100ms local reads and filter transitions; zero unnecessary network blocking.
2. **UX**: Compact information density, predictable click targets, instant visual feedback, and distraction-free review.
3. **Developer Experience**: Single-process deployment, zero external service dependencies (no Redis, no Postgres), and transparent GitHub-native data storage.

### Core Principles
1. **GitHub owns the data**: Issues, comments, labels, and assignees live on GitHub. Funnel maintains a disposable local mirror of GitHub data and durable state only for Funnel-first intake staging and authentication.
2. **No invented permissions**: Actions in Funnel map directly to GitHub permissions. Writes execute using the user's personal GitHub token; reads within an instance are open to the authenticated team.
3. **Opinionated metadata via plain labels**: Workflow status, priority, and sizing are stored strictly as standard GitHub labels. No markdown body pollution (frontmatter) and no coupling to GitHub Projects v2 custom fields.
4. **Reads are local, writes are honest (pessimistic)**: Every view is a query against the local SQLite mirror. Writes go directly to GitHub and reflect on-screen only once GitHub confirms success with an inline spinner.
5. **Funnel-first intake staging**: External submissions land in a local staging queue in SQLite first. Only upon explicit **Accept** does a submission become a GitHub issue.
6. **One team, one instance**: Multiple teams deploy separate instances.

---

## 2. Scope & Roadmap

### 2.1 In Scope (MVP)
- **Inbox**: Unified triage queue combining pending local intake submissions and untriaged GitHub issues (open issues missing a status label).
- **Issue Streams**: **Issues** with an internal **All** / **Mine** segmented filter (**Mine** = assigned to the current user, i.e. `assignee=me`), sorted by Priority (`p1` first) then Updated.
- **Status Board**: 6-column Kanban view (`Backlog`, `Todo`, `In Progress`, `In Review`, `Blocked`, and `Done` within 14 days) with status pickers on cards.
- **Issue Detail & Inspector Pane**: 480px docked side inspector pane for viewing plain-text issue bodies, reading comment threads, adding comments, editing title/body inline, and adjusting status/labels/assignees.
- **Filters & Search**: Six multi-select dropdown filters (Repo, Status, Assignee, Priority, Size, Labels) combined with AND across groups and OR within groups, with complete state serialized into URL query parameters. Text search powered by standard indexed SQLite queries via Drizzle ORM.
- **Funnel-First Intake**: Anonymous `POST /api/intake` (JSON) and `/submit` (JavaScript-free HTML form). Single-item triage actions: Accept, Dismiss, Duplicate.
- **GitHub Enterprise & Cloud Support**: Dynamic host configuration (`github.url`, `github.api_url`) for GitHub Enterprise Server (GHES), GHE.com data residency, or standard `github.com`.
- **Manual GitHub App Setup**: Operators register the GitHub App in GitHub settings and supply the credentials via environment variables (no built-in manifest flow).
- **Self-Healing Label Provisioning**: Automated background provisioning and conflict cleanup via `funnel[bot]`.
- **Theme Support**: Oxocarbon Dark and Light palette with an in-app System / Dark / Light switcher.

### 2.2 Post-MVP (Deferred)
- **Sanitized Markdown Rendering**: Rich GFM rendering in issue bodies and comments (plain text with preserved whitespace used in MVP).
- **Linked Pull Request Hydration**: PR summaries on cards/details (omitted in MVP to prevent GraphQL batch hydration timeouts).
- **Cycles / Sprints & Burndowns**: Time-boxed sprint tracking and velocity analytics.
- **Command Palette & Global Keyboard Shortcuts**: `⌘K` quick action menu and global hotkey navigation.
- **Drag-and-Drop**: Manual ordering and drag-and-drop on the Status Board.
- **Full-Text Search via FTS5**: Virtual SQLite FTS5 table triggers (standard `like` / substring SQL search used in MVP).
- **Saved Views & Query DSL**: Bookmarkable custom views with GitHub-style query qualifiers.
- **Bulk Triage**: Multi-select and batch accept/dismiss.
- **Comment Editing & Deletion**: Updating or removing existing comments.

### 2.3 Anti-Features (Never)
- **Second source of truth**: Funnel will never own durable issue records that cannot be rebuilt from GitHub.
- **Arbitrary custom roles or RBAC**: Funnel will not invent permissions independent of GitHub.
- **Telemetry or phone-home**: No analytics, usage tracking, or external error reporting.
- **Multi-tracker support**: No Jira, Linear, or GitLab synchronization.
- **Multi-team instances**: No workspace/team switcher.
- **Non-issue workspace suite**: No built-in chat, docs, wikis, or AI agents.

---

## 3. Architecture & Tech Stack

```
+-------------------------------------------------------------------------+
|                              Funnel Process                             |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                  SvelteKit UI (Svelte 5, bits-ui)                 |  |
|  |       Oxocarbon Palette, 3-Pane Layout (Sidebar, Stream, Inspector)  |  |
|  +---------------------------------+---------------------------------+  |
|                                    |                                    |
|                   SSE / HTTP API   | Server Actions                     |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  |                     Server Layer (Bun Runtime)                    |  |
|  |                                                                   |  |
|  |  +---------------------+  +-----------------+  +---------------+  |  |
|  |  | Better Auth + OAuth |  | Polling Sync    |  | Intake API    |  |  |
|  |  | (Enterprise GHE)    |  | Engine (REST+GQL)|  | (/api/intake) |  |  |
|  |  +----------+----------+  +--------+--------+  +-------+-------+  |  |
|  |             |                      |                   |          |  |
|  |             +------------+---------+-------------------+          |  |
|  |                          | Drizzle ORM                            |  |
|  |                          v                                        |  |
|  |         +----------------------------------+                      |  |
|  |         |     Single SQLite Database       |                      |  |
|  |         |        (data/funnel.db)          |                      |  |
|  |         |                                  |                      |  |
|  |         |  • auth_* (Sessions, Users)      |                      |  |
|  |         |  • state_* (Intake Staging)      |                      |  |
|  |         |  • mirror_github_* (Disposable)  |                      |  |
|  |         +----------------------------------+                      |  |
|  +--------------------------+----------------------------------------+  |
|                             |                                           |
|         Outbound REST / GQL | App Installation & User Tokens            |
+-----------------------------+-------------------------------------------+
                              v
             +----------------------------------+
             |         GitHub Instance          |
             |  (github.com, *.ghe.com, GHES)   |
             +----------------------------------+
```

### 3.1 Runtime & Database
- **Runtime**: Bun (`bun:sqlite`), TypeScript, SvelteKit (Svelte 5).
- **Adapter**: `svelte-adapter-bun` or `@sveltejs/adapter-node` running as a single process (`bun run start`).
- **Database**: Single SQLite file (`funnel.db`, path configurable via `FUNNEL_DB`).
  - `auth_*`: Managed by Better Auth (users, sessions, encrypted user tokens).
  - `state_intake_submission`: Funnel-first staging table for incoming issues before GitHub acceptance.
  - `mirror_github_*`: Disposable cache tables mirroring GitHub repos, issues, comments, labels, and assignees.
- **ORM**: Drizzle ORM across all tables. Standard SQL queries and indexing for searches (FTS5 omitted for initial operational simplicity).

### 3.2 Real-time Updates (SSE)
- Pushes sync updates to active browser clients using Server-Sent Events (`text/event-stream`).
- Includes a mandatory `: ping` heartbeat every 10–15 seconds to prevent Bun connection drops.
- Headers sent: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.

---

## 4. GitHub Integration & Enterprise Configuration

### 4.1 Enterprise & Cloud Host URLs
Funnel dynamically configures all Octokit clients, OAuth endpoints, and outbound web links from configuration:

```yaml
# funnel.config.yaml
github:
  url: https://acme.ghe.com          # Base web URL (OAuth, "Open on GitHub" links)
  api_url: https://acme.ghe.com/api/v3 # API base (REST; GraphQL served at /api/graphql)
```

- When using standard GitHub, defaults are `https://github.com` and `https://api.github.com`.
- Outbound issue links always resolve dynamically to `${github.url}/${org}/${repo}/issues/${number}`.

### 4.2 Credentials
- Required credentials: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
- Operators register the GitHub App manually in GitHub settings — `${github.url}/settings/apps/new` on GitHub, or the equivalent organization page on GitHub Enterprise — then supply the generated credentials via environment variables. Funnel ships no first-run setup route or App Manifest flow.
- The App must request the permissions **Issues (Read & Write)** and **Metadata (Read)**, and set its user authorization callback URL to `${FUNNEL_URL}/api/auth/callback/github`.

---

## 5. Metadata Contract & Reserved Labels

Funnel represents issue metadata strictly through standard GitHub labels across every configured repository.

### 5.1 Label Vocabulary

| Category | Canonical Labels | Default / Meaning of "No Label" |
| :--- | :--- | :--- |
| **Status** | `backlog`, `todo`, `in-progress`, `in-review`, `blocked` | **Untriaged** (Routed to Inbox) |
| **Priority** | `p1`, `p2`, `p3` | No priority |
| **Size** | `sm`, `md`, `lg` | Unestimated |

### 5.2 Rules & Conflict Resolution
1. **At most one label per category**: An issue may carry at most one status, one priority, and one size label.
2. **Automated conflict de-duplication**: If an issue accumulates multiple labels in the same category (e.g. both `todo` and `in-progress`), `funnel[bot]` queries the issue timeline events. The **latest added label wins**, and `funnel[bot]` removes the obsolete label on GitHub. If the timeline is ambiguous, Funnel flags the item in the UI.
3. **Closed state wins**: Closing an issue marks it as *Done* (closed as completed) or *Canceled* (closed as not planned). Existing status labels are preserved untouched. Reopening an issue restores its prior status label; if it had none, it returns to the Inbox.
4. **Self-healing provisioning**: At startup and during nightly reconciliation, Funnel creates any missing canonical labels across configured repositories and restores canonical colors/descriptions.
5. **Non-reserved labels**: All other labels (e.g. `frontend`, `bug`, monorepo domain tags) are preserved as-is, exposed as multi-select filter options, and assignable from the UI.

---

## 6. Intake & Staging Pipeline

Funnel supports an external intake queue where submissions are staged locally before polluting GitHub.

```
External Submitter
   │
   ├─► POST /api/intake (JSON)
   └─► POST /submit (Plain HTML Form)
         │
         ▼
  +──────────────────────────────+
  │   SQLite Staging Table       │
  │   (state_intake_submission)  │
  +──────────────┬───────────────+
                 │
                 ▼
         Funnel Triage Inbox
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
    Accept    Dismiss   Duplicate
       │         │         │
       │         │         └─► Appends comment to existing GitHub issue,
       │         │             deletes staging row.
       │         │
       │         └─► Hard-deletes staging row immediately (ephemeral).
       │
       └─► Creates GitHub issue in target repo (default: intake.default_repo),
           attaches labels/assignee, appends provenance text, deletes staging row.
```

### 6.1 Endpoints
- **`POST /api/intake`**: Accepts `application/json` (`{ "title": string, "body"?: string, "source"?: string }`). Returns `201 {"id": "..."}`. Open CORS headers enabled.
- **`GET /submit` & `POST /submit`**: JavaScript-free HTML `<form>` for browser-based submissions. Does not expose repo selectors or internal metadata.

### 6.2 Staging Triage Actions
- **Accept**:
  - Triager reviews submission in the Inbox.
  - Repo selector defaults to `intake.default_repo` (customizable in the Accept dialog).
  - Applies initial workflow status (default: `backlog`), priority, size, and assignees.
  - Appends provenance footer: `_Submitted via Funnel intake (source: <source>)_`.
  - Dispatches `POST /repos/{owner}/{repo}/issues` via user's GitHub token.
  - Upon GitHub confirmation, hard-deletes the row from `state_intake_submission`.
- **Dismiss**: Hard-deletes the row immediately from SQLite. No GitHub mutation; no local trash bin.
- **Duplicate**: Triager selects an existing issue from the mirror. Funnel posts the submission text as a comment on that issue and hard-deletes the staging row.

---

## 7. Mirror & Polling Synchronization

### 7.1 Data Mirroring
- **Tables**: `mirror_github_issue`, `mirror_github_comment`, `mirror_github_repo`, `mirror_github_repo_label`, `mirror_github_issue_label`, `mirror_github_issue_assignee`, `mirror_github_user`.
- **History Window**: All open issues plus issues closed within `sync.history_days` (default 90 days). Older closed issues are not mirrored.
- **PR Exclusion**: Pull Requests are skipped during sync to keep GraphQL hydration fast, predictable, and within GitHub's 10-second query timeout limit.
- **Disposable Schema**: Mirror tables carry no migration versioning. On schema changes, mirror tables are truncated and backfilled from GitHub.

### 7.2 Polling Mechanics
- **Change Detection**: REST `GET /repos/{owner}/{repo}/issues?since=...&sort=updated` sent with the cached ETag. Unchanged repositories return `304 Not Modified`, which does not decrement GitHub REST rate limits.
- **Hydration**: Modified issues are fetched via batched GraphQL (100 issues per query) for body, labels, assignees, and the first page of comments.
- **Cadence**:
  - **Active**: Every 30 seconds per repo when at least one user connection is active over SSE.
  - **Idle**: Backs off to 300 seconds (5 minutes) when no clients are connected.
- **Write Refresh**: Every successful write in Funnel triggers an immediate background refresh of that specific issue.
- **Nightly Reconciliation**: Daily full sweep to prune deleted/transferred issues and verify label provisioning.

---

## 8. Authentication & Permissions

- **Provider**: Better Auth with GitHub OAuth provider.
- **Network Gating**: Tuned for enterprise environments (`acme.ghe.com`) protected by network segmentation and enterprise SSO. Any authenticated enterprise user signing in via OAuth gains read access to the instance.
- **Token Storage**: User-to-server OAuth tokens and refresh tokens are stored encrypted at rest in `auth_account` using a key derived from `FUNNEL_SECRET`.
- **Token Refresh**: Automatically refreshes user access tokens before mutation requests if expired or approaching expiration.
- **Mutation Actor**: All issue writes, comments, and label changes execute using the signed-in user's token. GitHub enforces repository write permissions natively. Background sync and label provisioning execute using the GitHub App's installation token (`funnel[bot]`).

---

## 9. User Interface & Visual Design

The visual design language adheres strictly to [`docs/DESIGN.md`](file:///Users/torben/Workspace/Repositories/github.com/t128n/funnel/docs/DESIGN.md).

### 9.1 Design System & Theme
- **Palette**: Oxocarbon (IBM Carbon modernist palette).
  - Dark: Deep canvas `#161616`, Layer 1 `#262626`, Layer 2 `#393939`, Borders `#393939`.
  - Light: Canvas `#F2F4F8`, Layer 1 `#DDE1E6`, Layer 2 `#F2F4F8`, Borders `#DDE1E6`.
- **Theme Toggle**: In-app 3-way toggle (System / Dark / Light) in the sidebar footer.
- **Typography**: `Inter` for structural UI labels; `JetBrains Mono` for issue numbers (`repo#123`), commit SHAs, and tags. Base body text set to high-density `13px`.
- **Component Primitives**: Unstyled `bits-ui` for accessible dropdowns, dialogs, and popovers.

### 9.2 Layout Architecture
The authenticated cockpit pairs a navigation sidebar with a per-view layout:

1. **Navigation Sidebar (220px fixed)**:
   - Header: instance mark plus an AGPL-3.0 source link and quick-create (`C`) action; global Search stays bound to `⌘K`.
   - Views shown as a flat list: **Inbox**, **Issues** (with an internal **All** / **Mine** segmented filter), and **Board**.
   - Footer: theme switcher (System / Dark / Light) pinned above the separator, with the user profile and sign-out below it.
2. **Inbox / Issues — Master–Detail Split**:
   - **Feed column (360px fixed)**: a compact vertical master list. Top toolbar carries the view title + count, a Filter popover (the six multi-selects) and full-text search. Issue cards are two-line — status dot, `#id`, truncated title, relative time, then the `owner/repo` slug and reserved-label chips (status / priority / size) — with a rounded translucent hover/active fill. Default sort: **Priority (`p1` first, unprioritized last) then Updated**.
   - **Detail canvas (flexible width)**: always present; an empty state renders until a selection is made. Selecting an issue opens the Inspector; selecting a staged submission opens the intake document (body + Accept / Dismiss / Duplicate).
3. **Inspector / Detail Canvas**:
   - Breadcrumb action bar (`owner/repo` · `#id` · state badge · "opened by … · time") with an outbound "Open on GitHub" link.
   - Inline editing for Title (H1 input) and Body (open document text; textarea with preserved whitespace).
   - Inline property bar for Status, Priority, Size, Assignee, Labels.
   - Plain-text comment activity timeline (author, timestamp, preserved line breaks) with the new-comment composer pinned to the base.
4. **Board** retains the classic full-width kanban stream with a fixed `480px` Inspector docked on selection.

### 9.3 Status Board
- **Columns**: `Backlog`, `Todo`, `In Progress`, `In Review`, `Blocked`, and `Done`.
- `Done` displays issues closed as completed within `board.done_days` (default 14 days).
- Status changes executed via **card dropdown pickers** (no drag-and-drop in MVP).

### 9.4 Filter Bar & Search
- Six multi-select dropdown filters: Repo, Status, Assignee (with "Me" pinned first), Priority, Size, Labels.
- Logic: **OR** within the same dropdown, **AND** across different dropdowns.
- Text search: Instant client-side / server-side standard SQL `like` queries over issue titles, bodies, and comments.
- **URL Synchronization**: All filter and search parameters are bidirectionally mirrored to URL query parameters for bookmarking and link sharing.

---

## 10. Configuration Reference

### 10.1 `funnel.config.yaml`
```yaml
github:
  url: https://github.com               # Web base (e.g. https://acme.ghe.com)
  api_url: https://api.github.com       # API base (e.g. https://acme.ghe.com/api/v3)

repos:
  - orgA/core
  - orgA/web
  - orgB/infra

intake:
  default_repo: orgA/core              # Pre-fills Accept dialog

sync:
  history_days: 90                     # Closed issues history window
  poll_interval_active_seconds: 30     # Active SSE connection interval
  poll_interval_idle_seconds: 300      # Background idle interval

board:
  done_days: 14                        # Retention window for Done column

session:
  idle_days: 30                        # User session lifetime
```

### 10.2 Environment Variables
| Variable | Description |
| :--- | :--- |
| `FUNNEL_URL` | Base public URL of the Funnel instance |
| `FUNNEL_SECRET` | 32+ character key for database token encryption |
| `FUNNEL_DB` | Path to SQLite database file (default `./data/funnel.db`) |
| `GITHUB_APP_ID` | Numeric GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | PEM-encoded RSA private key for GitHub App |
| `GITHUB_CLIENT_ID` | GitHub App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub App Client Secret |
| `LOG_LEVEL` | Logging verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
