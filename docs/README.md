# Funnel documentation

The published site is available at <https://t128n.github.io/funnel/>. The Markdown files in this directory remain the source of truth and can also be read on GitHub.

## Start here

- **Install on Windows:** Download the Windows ZIP from [GitHub releases](https://github.com/t128n/funnel/releases), extract it, and run `.\funnel.exe setup` in PowerShell from the extracted folder. Alternatively, open `setup.cmd` if present. Follow [Install Funnel](how-to/deploy/install.md) through setup and GitHub App onboarding, then [triage a backlog](tutorials/triage-a-backlog.md).
- **Use Funnel:** [Create and edit issues](how-to/use/create-and-edit-issues.md), [triage intake](how-to/use/triage-intake.md), or [use the board](how-to/use/board.md).
- **Contribute:** Clone the repository, follow the [development guide](how-to/contribute/development.md), run the [tests](how-to/contribute/testing.md), and submit a pull request.

## Working on the site

From the repository root, install the runtimes pinned in `mise.toml`, run `bun install --frozen-lockfile`, then `mise run docs:dev` or `mise run docs:build`. Astro runs on Node as well as using Bun for dependency management. The build recreates the generated `docs/src/content/docs/` and `docs/public/assets/` directories from the existing Markdown and referenced assets; do not store hand-written files there. Edit the original files instead. Restart the development server after changing Markdown so the generated content is refreshed. The generated directories and `docs/dist/` are ignored by Git.

The site uses the `/funnel/` base path for GitHub Pages. Pull requests build the site; pushes to `main` deploy it through `.github/workflows/docs.yml` when GitHub Pages is configured to use GitHub Actions. Check links and examples against the implementation before publishing changes. Never use real credentials, private issue data, or production databases in documentation or recordings.

For a reproducible demo tour, start an isolated `bun run dev:demo` instance on port 5188 with `FUNNEL_DB`, `FUNNEL_UPLOAD_DIR`, and `FUNNEL_SECRET` explicitly set to disposable values, then run `bunx webreel validate -c docs/webreel.config.json` and `bunx webreel record -c docs/webreel.config.json cockpit-tour`. The recording is written to `docs/assets/guide/`. The tour snoozes a seeded submission, so use a fresh demo database for each recording. Demo mode inherits nonempty environment values, so check the paths before starting it; never point the recording at a production instance. Webreel requires its browser and FFmpeg dependencies. Review recordings for sensitive data before sharing them, and keep the written guides usable independently of video.

The pinned webreel dependency has a small Bun patch that disables Chrome's begin-frame-control flag, which stalled frame capture in our environment. Reassess the patch when upgrading webreel. Set `FFMPEG_PATH` to a compatible FFmpeg if webreel cannot download one automatically.

This index is the entry point to Funnel's documentation, which follows the four Diátaxis modes: tutorials for learning, how-to guides for doing, reference for looking up, and explanation for understanding.

## The four sections

| Section | Purpose | Use it when |
| :--- | :--- | :--- |
| [Tutorials](#tutorials) | A guided lesson with one working path and a visible result at each step. | You are new and want to get a complete outcome. |
| [How-to guides](#how-to-guides) | Task-focused steps for a specific job, assuming you already know the basics. | You need to deploy, configure, operate, or use a particular feature. |
| [Reference](#reference) | Facts: variables, commands, settings, routes, schemas, and vocabularies. | You need an exact name, default, or contract. |
| [Explanation](#explanation) | Background and trade-offs: why Funnel works the way it does. | You want to understand a design before changing or operating it. |

## What do you want to do?

| Goal | Start here |
| :--- | :--- |
| Install Funnel and sign in for the first time | [Install Funnel](how-to/deploy/install.md) |
| Run a submission from intake through triage, blocking, notes, and close/reopen | [Triage a backlog](tutorials/triage-a-backlog.md) |
| Configure estimates, plan a week, block work, and read an epic | [Plan and track a week](tutorials/plan-and-track-a-cycle.md) |
| Put Funnel into production | [Install Funnel](how-to/deploy/install.md), [reverse proxy](how-to/deploy/reverse-proxy.md), or [GitHub Enterprise Server](how-to/deploy/github-enterprise-server.md) |
| Back up, upgrade, or fix an instance | [Backup and restore](how-to/operate/backup-and-restore.md), [upgrade](how-to/operate/upgrade.md), [troubleshoot](how-to/operate/troubleshoot.md) |
| Configure the App, repositories, projects, people, or sync | [Configure Funnel](#configure) |
| Work an issue queue day to day | [Use the cockpit](#use) |
| Plan a week | [Plan a week](how-to/use/plan-work.md) |
| Track milestones and see whether they will land on their due date | [Use milestones](how-to/use/milestones.md), [read the timeline](how-to/use/milestones.md#read-the-timeline) |
| Measure actual time, record a delay, or group issues into an epic | [Track time and delays](how-to/use/track-time-and-delays.md), [manage epics](how-to/use/epics.md) |
| Call the intake API or hook up a Windows hotkey | [Integrate](#integrate) |
| Build, test, or release Funnel | [Contribute](#contribute) |
| Find an exact setting, route, label, or command | [Reference](#reference) |
| Understand the architecture or workflow | [Explanation](#explanation) |

## Tutorials

Learning-oriented, with one path and expected results.

- [Getting started](tutorials/getting-started.md) — install the Windows release, create and install the GitHub App through onboarding, and reach the cockpit.
- [Triage a backlog](tutorials/triage-a-backlog.md) — stage an intake submission, accept it into a repository, triage an issue, move a board card, block it, add and publish a work note, attach a file, then close and reopen.
- [Plan and track a week](tutorials/plan-and-track-a-cycle.md) — configure estimates and net hours, plan a week, block an issue with a structured reason, create an epic, and read the rollups.

## How-to guides

### Deploy

- [Install Funnel](how-to/deploy/install.md) — run the cross-platform `funnel setup` wizard and manage the native service.
- [Install Funnel on Linux with systemd](how-to/deploy/linux-systemd.md) — use the checked-in unit and environment template for bare-metal or config-managed hosts.
- [Put Funnel behind a reverse proxy](how-to/deploy/reverse-proxy.md) — forward the proto and host headers and expose the health endpoints.
- [Use GitHub Enterprise Server](how-to/deploy/github-enterprise-server.md) — point the web and API hosts at a GHES instance before onboarding.

### Operate

- [Back up and restore](how-to/operate/backup-and-restore.md) — protect the SQLite database, uploads, and `.env` together.
- [Upgrade Funnel](how-to/operate/upgrade.md) — replace the executable or image, apply migrations, and gate traffic on readiness.
- [Troubleshoot](how-to/operate/troubleshoot.md) — work through startup, sync, sign-in, and upload failures.
- [Prepare an instance for operation](how-to/operate/production-checklist.md) — review deployment, security, health and recovery before inviting users.

### Configure

- [Onboard the GitHub App](how-to/configure/onboard-github-app.md) — create, install, inspect, or replace the App from the wizard or Settings.
- [Configure repositories](how-to/configure/repositories.md) — choose what Funnel mirrors and set the shortcodes used in issue references.
- [Configure projects](how-to/configure/projects.md) — map GitHub labels to project names and enable project grouping.
- [Manage people and roles](how-to/configure/people-and-roles.md) — assign `read`, `write`, and `admin`, including the last-admin rule.
- [Configure sync](how-to/configure/sync.md) — set the history window and the active/idle polling cadence.
- [Configure the board](how-to/configure/board.md) — set the Done window and per-stage Work-in-Progress limits.
- [Configure features](how-to/configure/features.md) — choose per-browser rendering, work-note, and attachment visibility.
- [Configure estimates and weekly plans](how-to/configure/planning.md) — set size minutes, net hours and the 60% allocation cap.

### Use

- [Triage intake](how-to/use/triage-intake.md) — accept, dismiss, or duplicate a staged submission.
- [Save and reuse views](how-to/use/saved-views.md) — store the current filters, sort and grouping as a personal or shared preset.
- [Create and edit issues](how-to/use/create-and-edit-issues.md) — create an issue, then edit its title, description, properties, assignees, and labels.
- [Close, reopen, and block](how-to/use/close-reopen-block.md) — record resolutions, reopen notes, and structured blockers with re-check dates.
- [Plan a week](how-to/use/plan-work.md) — commit sized issues from their Properties panel and handle the 60% capacity cap.
- [Track time and delays](how-to/use/track-time-and-delays.md) — read actual time, record manual delays, and understand why tracking starts at deployment.
- [Manage epics](how-to/use/epics.md) — mark an epic, edit its child list in the issue body, and read progress and time rollups.
- [Use the board](how-to/use/board.md) — drag cards, switch to the Backlog list, and use the Done lane.
- [Use the matrix](how-to/use/matrix.md) — read the impact × urgency grid, find unassessed work, and rate both axes.
- [Use milestones](how-to/use/milestones.md) — browse repo-scoped milestones, filter and group by them, and set or create one from an issue.
- [Read the milestone timeline](how-to/use/milestones.md#read-the-timeline) — project open milestones as an Apache ECharts Gantt from plan weeks and observed status changes.
- [Comments, reactions and mentions](how-to/use/comments.md) — edit or delete your own GitHub comments, react, and mention repository collaborators.
- [Read issue history](how-to/use/issue-history.md) — filter an issue's activity between comments and the unified status, label, assignee and GitHub event history.
- [Work notes and attachments](how-to/use/work-notes-and-attachments.md) — keep internal notes, publish them, and manage the file dropbox.
- [Keyboard shortcuts](how-to/use/keyboard.md) — the global and board bindings, plus arrow-key navigation.
- [Notifications](how-to/use/notifications.md) — follow updates and manage the notification feed.
- [Read insights](how-to/use/insights.md) — scope and interpret the triage dashboard.
- [Review work needing attention](how-to/use/attention.md) — review blockers, waiting work and rule breaches.

### Integrate

- [Use the intake API](how-to/integrate/intake-api.md) — `POST /api/intake` with `title`, `body`, and `source`.
- [Set up the Windows intake hotkey](how-to/integrate/windows-intake-hotkey.md) — stage the current text selection from Teams or Outlook with a global shortcut.

### Contribute

- [Development](how-to/contribute/development.md) — set up a checkout, run the dev server, and find your way around the code.
- [Testing](how-to/contribute/testing.md) — run the Bun test suite, type checks, and build verification.
- [Release](how-to/contribute/release.md) — produce the executable and the release checks.

## Reference

- [Environment variables](reference/environment-variables.md) — every deploy-time variable, its default, and its purpose.
- [CLI](reference/cli.md) — the packaged executable's flags and the Bun scripts it maps to.
- [Build tasks](reference/build-tasks.md) — the `mise` tasks and what each one produces.
- [Settings](reference/settings.md) — the instance settings stored in SQLite, with defaults and validation rules.
- [Attention rules](reference/attention-rules.md) — first-response, stale-open, re-check and waiting thresholds, boundary semantics, UTC vs local clocks, and notification cadence.
- [Planning and time](reference/planning-and-time.md) — estimates, capacity, weeks, actual-time and delay rules, epic metadata, tables and endpoints.
- [Reserved labels](reference/reserved-labels.md) — the canonical status, impact, urgency, size, flag, and epic vocabulary plus the retired priority labels.
- [Impact, urgency, and priority](reference/priority.md) — the three-point input labels, the P1–P3 lookup matrix, the 3×3 matrix view, the rating criteria, and the retired priority labels.
- [Roles and permissions](reference/roles-and-permissions.md) — what `read`, `write`, and `admin` may do.
- [HTTP API](reference/http-api.md) — the intake endpoint, mutation endpoints, mirror reads, and health probes.
- [Database schema](reference/database-schema.md) — mirror tables, Funnel-owned state, and authentication tables.
- [Routes and pages](reference/routes-and-pages.md) — the public, onboarding, cockpit, settings, and API route map.
- [Insights](reference/insights.md) — triage metric formulas, UTC date-range semantics, snapshot vs range clocks, and empty-data behavior.
- [Feature flags](reference/feature-flags.md) — the flag keys, defaults, and per-browser overrides.
- [Glossary](reference/glossary.md) — the terms Funnel uses for intake, mirror, triage, workflow, actual time, delays, and epics.

## Explanation

- [Architecture](explanation/architecture.md) — the SvelteKit process, SQLite mirror, background worker, and SSE bridge.
- [Sync and mirror](explanation/sync-and-mirror.md) — polling, hydration, cursors, and what the mirror deliberately does not keep.
- [Workflow model](explanation/workflow-model.md) — status, derived priority, size, blocking, and Done as separate concepts.
- [Why planning and actuals work this way](explanation/planning-and-actuals.md) — the three layers of state, the 60% buffer, observed actuals, interval delays and body-based epics.
- [Intake lifecycle](explanation/intake-lifecycle.md) — staging, accepting, dismissing, duplicating, and where history lives.
- [Security model](explanation/security-model.md) — sessions, encrypted credentials, role enforcement, and user-token writes.
- [Deployment model](explanation/deployment-model.md) — why Funnel is one long-lived process with local state.
- [Design principles](explanation/design-principles.md) — the register-first, text-state, density and keyboard standards behind the cockpit.
- [Design language](explanation/design-language.md) — how Funnel applies Bootstrap 5, Sveltestrap, and Bootstrap Icons to the cockpit.

## Project documents

- [Design system baseline](plans/2026-10-25-design-system-baseline.md) — the cross-app principles, roles, typography, surface, accessibility and governance rules.
- [DESIGN.md](DESIGN.md) — Funnel’s application profile of the baseline: records, status mapping, tokens, views and interaction details.
- [scripts/README.md](../scripts/README.md) — the Windows intake helpers, icon generator, and their current status.
- [Guide screenshot automation](screenshots/README.md) — the manifest, capture command, checking rules and non-browser exceptions for documentation images.

## Conventions

For source checkout and documentation development, run commands from the repository root unless a document says otherwise; paths in those code fences are relative to that root. Release installation commands instead run from the extracted archive or the location specified in the guide. Environment variables are written in `UPPER_SNAKE_CASE`; settings keys use dotted names such as `sync.history_days`.

## Related

- [Funnel README](../README.md)
- [Getting started](tutorials/getting-started.md)
- [Triage a backlog](tutorials/triage-a-backlog.md)
- [Plan and track a week](tutorials/plan-and-track-a-cycle.md)
