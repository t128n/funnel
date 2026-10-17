# Funnel: Authoritative Design Interview

This document tracks the **design tree** to resolve contradictions between `DRAFT-SPEC-1.md`, `DRAFT-SPEC-2.md`, and `DESIGN.md`. Decisions are addressed in rounds along the active frontier.

---

## Round 1: Core Architectural & Product Frontier

Answer below each question in-place (e.g. `Answer: Yes` or custom feedback/choices). Every question is phrased so that **"Yes"** accepts the recommended answer.

---

❓ **Q1** - **Product Identity & Scope (Triage Cockpit vs. Full Linear Clone)**: Should Funnel be built strictly as an ultra-fast, mouse-first **GitHub Triage Cockpit** (as defined in Draft 1 and `docs/DESIGN.md`) focused on an aggregated Inbox, All/My Issues streams, and a simple Status Board, rather than expanding into a full project management platform with sprint cycles, roadmaps, burndown charts, and spreadsheet grids (Draft 2)?

- **Option A (Draft 1 - Recommended)**: Fast triage layer for GitHub. Defers cycles, roadmaps, multi-layout grids, and PR automations to post-MVP or anti-features. GitHub remains the undisputed home for project management.
- **Option B (Draft 2)**: Full-featured Linear/Plane replacement. Manages cycles/sprints (mapped to Milestones), initiatives (Projects), velocity tracking, and multi-view layouts.

➡️ **Yes**, focus strictly on the **Triage Cockpit** MVP. Building a full Linear clone creates massive surface area and requires managing concept models (cycles, roadmaps, burndowns) that dilute the core value proposition of sub-100ms multi-repo GitHub triage.

**Your Answer:** triage cockpit

---

❓ **Q2** - **Metadata Storage Contract (Plain Labels vs. Frontmatter / Projects v2)**: Should issue metadata (priority, sizing, workflow status) be stored exclusively as **plain GitHub labels** (`p1`–`p3`, `s`/`m`/`l`, `backlog`...`blocked`), rejecting YAML frontmatter in issue descriptions and GitHub Projects v2 custom fields?

- **Option A (Draft 1 - Recommended)**: Strictly standard GitHub labels. Zero pollution of issue bodies with machine metadata, transparent to standard GitHub UI/CLI users, and trivial to sync and reconcile without format migrations.
- **Option B (Draft 2)**: Structured YAML frontmatter in issue markdown bodies, or syncing with GitHub Projects v2 custom fields. Allows arbitrary types (estimates, dates), but modifies issue markdown bodies, creates parsing fragilities, or couples Funnel to the Projects v2 GraphQL API.

➡️ **Yes**, stick to **plain GitHub labels** as the sole metadata mechanism. It preserves zero-leakage transparency for native GitHub workflows, avoids corrupting human-edited issue markdown, and keeps synchronization robust.

**Your Answer:** yes

---

❓ **Q3** - **Data Ingestion & Network Topology (Polling Mirror vs. Public Webhooks)**: Should Funnel rely entirely on **polling-based synchronization** (conditional REST `304 Not Modified` change detection + batched GraphQL hydration) and Server-Sent Events (SSE) to the browser, avoiding the requirement for an inbound public GitHub Webhook endpoint?

- **Option A (Draft 1 - Recommended)**: Polling-only mirror. Allows operators to run Funnel securely on private intranets or behind VPNs without exposing a webhook receiver to the public internet (only optional `/submit` and `/api/intake` are exposed).
- **Option B (Draft 2)**: Webhook-driven real-time ingestion. Eliminates polling latency for external GitHub events, but strictly requires Funnel to have a publicly routable HTTPS endpoint (or reverse tunnel like smee/ngrok) and webhook secret validation.

➡️ **Yes**, adopt **polling-based sync** for the core architecture. Free conditional REST 304s provide ~30s freshness without requiring open inbound ports or public webhook infrastructure, making self-hosting behind internal networks dramatically simpler.

**Your Answer:** yes

---

❓ **Q4** - **Mutation State & Write Feedback (Pessimistic Confirmation vs. Optimistic UI)**: Should Funnel use **pessimistic UI mutations** (inline loading spinners on buttons/dropdowns until GitHub confirms the write) rather than optimistic client-side updates with rollback handling?

- **Option A (Draft 1 - Recommended)**: Honest, pessimistic writes. UI updates only after GitHub responds with `200/201`. Zero desync risk, no complex rollback states, and no phantom success if GitHub rejects an update or hits rate limits.
- **Option B (Draft 2)**: Optimistic UI updates. Local cache and client state update instantly (0ms latency), sending asynchronous mutations in the background. Requires complex revert logic and toast warnings if GitHub writes fail or conflict.

➡️ **Yes**, enforce **pessimistic UI mutations**. Because Funnel is a thin layer over GitHub, optimistic updates create race conditions with external collaborators and require complex rollback mechanics. Fast feedback loops with honest inline spinners keep the system reliable.

**Your Answer:** a

---

❓ **Q5** - **Primary Interaction Model (Mouse-First Dense Cockpit vs. Keyboard-First ⌘K Palette)**: Should the initial MVP prioritize a **mouse-first dense triaging experience** with a 3-pane layout (sidebar, stream, inspector pane) as detailed in `docs/DESIGN.md`, deferring a global `⌘K` command palette and extensive hotkey navigation to post-MVP?

- **Option A (Draft 1 & DESIGN.md - Recommended)**: Mouse-first, high-density cockpit. Explicit controls powered by `bits-ui`, 36px fixed-height issue rows, and a side inspector pane. Keyboard navigation is limited to standard browser/dialog focus controls.
- **Option B (Draft 2)**: Keyboard-first power-user tool. Central command palette (`⌘K`), single-key shortcuts (`c` for close, `m` for milestone, `p` for priority) from day one.

➡️ **Yes**, build the **mouse-first dense layout with an inspector pane** first. Perfecting click targets, inspection ergonomics, and multi-repo layout density establishes the visual foundation before layering on a command palette and global keyboard interception.

**Your Answer:** a

---

❓ **Q6** - **Infrastructure & Deployment Footprint (Single-Process SQLite vs. Twelve-Factor Postgres/Redis)**: Should Funnel run as a **single-process SvelteKit + `bun:sqlite` application** (with embedded FTS5), explicitly avoiding external database engines (PostgreSQL) or cache brokers (Redis)?

- **Option A (Draft 1 - Recommended)**: Single-process Bun + SQLite (`funnel.db`). Zero external daemon dependencies; background sync runs as an in-process worker; deployed from source or a single binary/container.
- **Option B (Draft 2)**: Twelve-Factor distributed stack. Stateless web/API processes backed by external PostgreSQL and Redis instances, designed for horizontal scaling across Kubernetes/Helm.

➡️ **Yes**, keep Funnel as a **single-process SQLite application**. A single team instance across a dozen repos has modest throughput requirements easily satisfied by Bun + SQLite with FTS5, drastically lowering operator burden.

**Your Answer:** a

---

_Note from User_: "Also answer already: i do not want to store all issues in github directly. e.g. other intakes should be funnel first and on acceptance into github."
_(Recorded: Intake is Funnel-first in SQLite; only accepted submissions become GitHub issues)._

---

## Round 2: Data Lifecycle, Access Control, and Triaging Mechanics

Decisions branching directly off the Round 1 root. Answer below each question in-place. Every question is phrased so that **"Yes"** accepts the recommended answer.

---

❓ **Q7** - **Instance Access Control & Organization Gating**: Should Funnel restrict sign-in to members of the configured GitHub organization(s) (or an explicit `auth.allowed_users` config list), rather than allowing any arbitrary GitHub user who signs in to view all mirrored repositories?

- **Option A (Recommended)**: Organization / user allowlist check on login. Rejects unauthorized GitHub users at OAuth callback time. Eliminates Draft 1's "Known Risk #1" (private repo exposure).
- **Option B (Draft 1 original)**: Completely open login to any GitHub user. Relies entirely on operator network isolation (VPN/firewall) to prevent strangers from accessing the instance.

➡️ **Yes**, enforce an **organization / user allowlist gate** during OAuth login. Restricting access to members of the configured orgs prevents accidental leakage of private repos and keeps instance data secure by default.

**Your Answer:** B, because limited to enterprise acme.ghe.com and network segmentation.

---

❓ **Q8** - **Intake Lifecycle & Triage Actions**: Should Funnel keep pending intake submissions strictly ephemeral in SQLite (`state_intake_submission`)—hard-deleting them immediately upon **Accept** (create GitHub issue), **Dismiss** (drop submission), or **Duplicate** (append comment to an existing issue)—with no permanent intake archive or undo in MVP?

- **Option A (Draft 1 - Recommended)**: Ephemeral inbox. When triaged, the pending submission row is immediately deleted. Accepted items live on GitHub; dismissed items are purged; duplicate items live as comments on GitHub issues. No trash bin, no undo.
- **Option B**: Soft-delete archive. Submissions have a `status` (`pending`, `accepted`, `dismissed`, `duplicate`) kept in SQLite for audit history, review, and recovery if dismissed by accident.

➡️ **Yes**, keep intake submissions **strictly ephemeral** with hard deletion upon decision. This prevents SQLite bloat, keeps the triage inbox simple, and adheres to the principle that durable history belongs on GitHub once accepted.

**Your Answer:** yes

---

❓ **Q9** - **Label Contract & Automatic Conflict Cleanup**: Should Funnel strictly enforce the plain label taxonomy (`p1`–`p3`, `s`/`m`/`l`, `backlog`, `todo`, `in-progress`, `in-review`, `blocked`), where Funnel automatically provisions missing labels and a background bot cleans up multiple conflicting labels in the same group (keeping the latest added label)?

- **Option A (Draft 1 - Recommended)**: Fixed, plain label names without prefixes. Funnel provisions missing labels with canonical colors/descriptions. If an issue accumulates multiple status/priority labels, the GitHub App bot inspects the timeline and strips the superseded one.
- **Option B**: Configurable label prefixes (e.g. `status/in-progress`, `priority/p1`) or manual-only conflict resolution (flag in UI, no bot deletions).

➡️ **Yes**, enforce the **fixed plain label taxonomy with automated bot conflict cleanup**. Plain names are clean, universally readable, and automatic bot de-duplication prevents corrupted board states.

**Your Answer:** A

> **Update (Oct 2026):** The size labels were renamed from single letters (`s`/`m`/`l`) to `sm`/`md`/`lg` to cut collisions with existing repo labels; see `docs/SPEC.md` §5.1.

---

❓ **Q10** - **Closed Issue State & Pull Request Exclusion in MVP**: Should closed issues follow the **"closed state wins"** rule (preserving their existing status label untouched without resetting it), while **Pull Requests are completely excluded** from the mirror, board, and triage inbox in the MVP?

- **Option A (Draft 1 - Recommended)**: Closed state wins (closing an issue leaves its label as-is; reopening restores that workflow state). PRs are filtered out of the sync mirror entirely to keep GraphQL hydration deterministic and avoid API timeouts.
- **Option B**: Active label synchronization on close (e.g., removing `in-progress` or replacing with `done` label on GitHub), and/or including PR cards or PR badges on issues in MVP.

➡️ **Yes**, treat **closed state as sovereign** and **exclude PRs from the MVP mirror**. Leaving status labels intact on close ensures reopening an issue instantly restores its prior context, and excluding PRs eliminates GraphQL timeline timeouts during sync.

**Your Answer:** yes

---

❓ **Q11** - **Issue Detail Markdown Rendering (Sanitized GFM vs. Plain Text)**: In the 480px Inspector Pane and Issue Detail views, should Funnel render **sanitized GitHub Flavored Markdown (GFM)** (supporting headers, lists, code blocks, and check-boxes) rather than displaying raw plain text with preserved line breaks?

- **Option A (Recommended)**: Render sanitized GFM. Developer issue triage is severely hindered if code snippets, tables, backticks, and lists appear as unformatted raw markdown. A lightweight client-side renderer with HTML sanitization provides standard fidelity without adding backend complexity.
- **Option B (Draft 1 original)**: Plain text only with preserved whitespace. Zero markdown parsing, zero HTML rendering, images displayed as raw URL strings.

➡️ **Yes**, render **sanitized GitHub Flavored Markdown (GFM)** in the Inspector. Markdown is essential for reading technical issue reports, code blocks, and reproduction steps during triage, and client-side sanitization keeps it safe and fast.

**Your Answer:** plain text for now

---

## Round 3: Enterprise Integration, Intake Details, and View Mechanics

Decisions branching directly off the Round 2 answers. Answer below each question in-place. Every question is phrased so that **"Yes"** accepts the recommended answer.

---

❓ **Q12** - **GitHub Enterprise (GHE) Configuration & Dynamic Base URLs**: Since Funnel will run against enterprise GitHub instances (e.g. `acme.ghe.com`), should Funnel support explicit host configuration (`github.url` and `github.api_url`) in `funnel.config.yaml` / environment variables, dynamically configuring Octokit `baseUrl`, OAuth authorize/token endpoints, `/setup` app manifest URLs, and outbound "Open on GitHub" links?

- **Option A (Recommended)**: Configurable GitHub hosts. Allows running against GitHub Enterprise Server (GHES), GitHub Enterprise Cloud data residency (`*.ghe.com`), or standard `github.com`. Octokit, OAuth, and web links adjust dynamically.
- **Option B**: Hardcode standard `github.com` and `api.github.com`, requiring code modifications for enterprise hosting.

➡️ **Yes**, support **configurable GitHub web and API host URLs**. This ensures seamless operation with Enterprise Cloud custom domains (`acme.ghe.com`) and on-premise GHES.

**Your Answer:** a

> **Update (Oct 2026):** The `/setup` App Manifest flow referenced in this question was subsequently dropped; operators now create the GitHub App manually. Host configuration is unaffected — see `docs/SPEC.md` §4.

---

❓ **Q13** - **Intake Staging Routing & Issue Provenance**: For pending intake submissions (`POST /api/intake` and `/submit`), should Funnel route accepted items by default to a configured `intake.default_repo` (with a repo selector dropdown in the Accept dialog), and append a plain-text provenance footer (`_Submitted via Funnel intake (source: …)_`) to the created GitHub issue body?

- **Option A (Draft 1 - Recommended)**: Configurable `intake.default_repo` pre-populating the Accept dialog, with a non-destructive provenance line appended to the created GitHub issue body indicating submission origin.
- **Option B**: Require the submitter to select the target repo at intake time, or omit provenance attribution entirely on created issues.

➡️ **Yes**, adopt **`intake.default_repo` with a plain-text provenance footer**. Submitters shouldn't need to know repo structures, and triagers can easily re-route during Accept while preserving submission context.

**Your Answer:** a

---

❓ **Q14** - **Stream Sorting & Inspector Triage Mechanics**: In the main triage stream and inspector pane, should sorting default to **Priority (`p1` first, unprioritized last) then Updated**, with the 480px Inspector Pane supporting inline editing of Title/Body and adding new comments, while excluding comment editing/deletion and manual drag reordering in MVP?

- **Option A (Draft 1 - Recommended)**: Priority-then-Updated sort order. Inspector supports viewing full plain-text thread, adding comments, editing title/body, and changing labels/status. No comment editing/deletion or manual re-ordering in MVP.
- **Option B**: Strict chronological sort only (Updated or Created), or include rich comment management (editing/deleting existing comments) in the MVP.

➡️ **Yes**, adopt **Priority-then-Updated sorting with inline comment posting and title/body editing**. This puts high-urgency items at the top of the stream and gives triagers immediate resolution tools without the overhead of comment modification APIs.

**Your Answer:** yes

---

❓ **Q15** - **Status Board Columns & Done Window**: Should the Status Board feature exactly five active workflow columns (`Backlog`, `Todo`, `In Progress`, `In Review`, `Blocked`) plus a **`Done`** column displaying issues closed as completed within the last 14 days (`board.done_days`), with status transitions performed via card dropdown pickers?

- **Option A (Draft 1 - Recommended)**: 6-column board (5 active + Done within 14 days). Canceled issues are omitted from the board (accessible in All Issues). Status is updated via dropdown on each card (no drag-and-drop).
- **Option B**: Include Canceled as a column, keep Done issues indefinitely, or require drag-and-drop mechanics in the MVP.

➡️ **Yes**, enforce the **6-column board with a 14-day Done window and card dropdown status pickers**. A bounded Done column prevents the board from drowning in historical completed work, and dropdowns ensure fast, reliable status updates without fragile drag-and-drop touch/mouse edge cases.

**Your Answer:** a

---

❓ **Q16** - **Filter Dimension Set & Full-Text Search (FTS5)**: Should Funnel provide six multi-select dropdown filters (Repo, Status, Assignee, Priority, Size, Non-reserved Labels) combined via AND across groups and OR within groups, with full-text search powered by SQLite FTS5 over titles, bodies, and comments, and the entire filter/search state serialized in the URL?

- **Option A (Draft 1 - Recommended)**: 6 multi-select dropdowns (AND across dimensions, OR within dimension) + SQLite FTS5 search bar, with all state synchronized to URL query parameters for shareable/bookmarkable team views.
- **Option B**: Simple single-select filters or custom filter DSL query language (e.g. `label:bug is:open`) without FTS5 indexing.

➡️ **Yes**, implement the **6-filter dropdown system with SQLite FTS5 full-text search and URL state serialization**. It delivers fast, intuitive filtering with instant team URL sharing while leveraging Bun's built-in SQLite FTS5 engine.

**Your Answer:** a but fts5 full text etc is not hard requirement. only sqlite & drizzle for now for simplicity.
_(Recorded: Use standard SQLite queries via Drizzle ORM; FTS5 virtual tables deferred)._

---

## Round 4: Final Frontier — Operations, Setup Flow, and Drizzle Schema

This is the final frontier resolving the remaining operational and implementation mechanics across the specs. Answer below each question in-place. Every question is phrased so that **"Yes"** accepts the recommended answer.

---

❓ **Q17** - **Database Architecture & Search Implementation**: Per your note on keeping SQLite and Drizzle simple, should Funnel implement the local mirror and intake entirely via **standard Drizzle ORM schemas and SQL queries** (`like` / substring matching for text search), completely omitting FTS5 virtual table dependencies and custom SQLite extension compilation?

- **Option A (Recommended)**: Pure Drizzle ORM tables (`mirror_github_*`, `state_intake_submission`, `auth_*`) using standard SQL filtering and `like` search. Eliminates SQLite compile-time extension caveats (e.g. macOS native libsqlite differences) and keeps migrations clean.
- **Option B**: Build custom SQLite FTS5 triggers and virtual tables alongside Drizzle.

➡️ **Yes**, use **pure Drizzle ORM with standard SQLite queries** for all mirror tables and text search. For a team's active issue count (a few thousand issues), indexed SQL and `like` filtering is virtually instantaneous on Bun SQLite without FTS5 complexity.

**Your Answer:** A

---

❓ **Q18** - **First-Run App Setup & Self-Healing Label Provisioning**: Should Funnel include the **`/setup` GitHub App Manifest flow** for one-click initial setup (generating app credentials and outputting `.env` config), and run a **startup self-healing label provisioner** that automatically creates canonical reserved labels (`p1-p3`, `s/m/l`, `backlog..blocked`) in all configured repos using the App installation token?

- **Option A (Draft 1 - Recommended)**: `/setup` runs GitHub's App Manifest creation flow when credentials are missing, and a startup routine automatically creates or restores canonical colors/descriptions for the reserved labels via `funnel[bot]`.
- **Option B**: Require operators to create the GitHub App completely manually in GitHub settings, and require teams to manually create the labels across every repo.

➡️ **Yes**, include the **`/setup` manifest flow and automatic label provisioning**. This makes onboarding a new repo or fresh instance frictionless and guarantees label contract consistency across all repositories.

**Your Answer:** A

> **Update (Oct 2026):** The `/setup` App Manifest flow was dropped in favor of manual GitHub App creation (`docs/SPEC.md` §4.2). The automatic self-healing label provisioner remains in scope (Milestone 2 in `TODO.md`).

---

❓ **Q19** - **Theme Preference Controls (Oxocarbon Palette)**: While adhering strictly to the **Oxocarbon Dark and Light palette** defined in `docs/DESIGN.md`, should Funnel support an explicit **System / Dark / Light theme switcher** in the UI (persisted in local storage or cookie), rather than forcing system-preference-only switching?

- **Option A (Recommended)**: Provide a 3-way toggle (System / Dark / Light) in the bottom sidebar, defaulting to System. Applies Oxocarbon Dark or Light CSS tokens accordingly.
- **Option B (Draft 1 original)**: Strict system-preference only (CSS `prefers-color-scheme`). No manual UI toggle.

➡️ **Yes**, add a **System / Dark / Light theme toggle** applying the Oxocarbon tokens. Developers often work in dark mode even when system settings vary, and an in-app toggle is standard and low overhead.

**Your Answer:** A

---

❓ **Q20** - **Runtime & Packaging Pipeline**: Should Funnel be packaged and run using **Bun with `@sveltejs/adapter-node` or `svelte-adapter-bun`** as a single self-contained Node/Bun web process (`bun run build` && `bun run start`), logging structured JSON to stdout with no external telemetry or update-checks?

- **Option A (Draft 1 - Recommended)**: Single web process on Bun, structured JSON logging to stdout, completely telemetry-free (AGPL-3.0 footer link), deployed from source or Dockerfile.
- **Option B**: Introduce standalone multi-process services or background queues.

➡️ **Yes**, keep the **single self-contained Bun server process with zero telemetry**. It minimizes operational footprint, runs anywhere Bun or Docker can run, and adheres strictly to private self-hosting principles.

**Your Answer:** A

---
