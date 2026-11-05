# Funnel documentation

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
| Install Funnel and sign in for the first time | [Getting started](tutorials/getting-started.md) |
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

- [Getting started](tutorials/getting-started.md) — install Bun, run Funnel locally, create and install the GitHub App through onboarding, and reach the cockpit.
- [Triage a backlog](tutorials/triage-a-backlog.md) — stage an intake submission, accept it into a repository, triage an issue, move a board card, block it, add and publish a work note, attach a file, then close and reopen.
- [Plan and track a week](tutorials/plan-and-track-a-cycle.md) — configure estimates and net hours, plan a week, block an issue with a structured reason, create an epic, and read the rollups.

## How-to guides

### Deploy

- [Install Funnel](how-to/deploy/install.md) — run the cross-platform `funnel setup` wizard and manage the native service.
- [Put Funnel behind a reverse proxy](how-to/deploy/reverse-proxy.md) — forward the proto and host headers and expose the health endpoints.
- [Use GitHub Enterprise Server](how-to/deploy/github-enterprise-server.md) — point the web and API hosts at a GHES instance before onboarding.

### Operate

- [Back up and restore](how-to/operate/backup-and-restore.md) — protect the SQLite database, uploads, and `.env` together.
- [Upgrade Funnel](how-to/operate/upgrade.md) — replace the executable or image, apply migrations, and gate traffic on readiness.
- [Troubleshoot](how-to/operate/troubleshoot.md) — work through startup, sync, sign-in, and upload failures.

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
- [Work notes and attachments](how-to/use/work-notes-and-attachments.md) — keep internal notes, publish them, and manage the file dropbox.
- [Keyboard shortcuts](how-to/use/keyboard.md) — the global and board bindings, plus arrow-key navigation.

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
- [Planning and time](reference/planning-and-time.md) — estimates, capacity, weeks, actual-time and delay rules, epic metadata, tables and endpoints.
- [Reserved labels](reference/reserved-labels.md) — the canonical status, impact, urgency, size, flag, and epic vocabulary plus the retired priority labels.
- [Impact, urgency, and priority](reference/priority.md) — the three-point input labels, the P1–P3 lookup matrix, the 3×3 matrix view, the rating criteria, and the retired priority labels.
- [Roles and permissions](reference/roles-and-permissions.md) — what `read`, `write`, and `admin` may do.
- [HTTP API](reference/http-api.md) — the intake endpoint, mutation endpoints, mirror reads, and health probes.
- [Database schema](reference/database-schema.md) — mirror tables, Funnel-owned state, and authentication tables.
- [Routes and pages](reference/routes-and-pages.md) — the public, onboarding, cockpit, settings, and API route map.
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

## Conventions

Run commands from the repository root unless a document says otherwise. Paths in code fences are relative to that root. Environment variables are written in `UPPER_SNAKE_CASE`; settings keys use dotted names such as `sync.history_days`.

## Related

- [Funnel README](../README.md)
- [Getting started](tutorials/getting-started.md)
- [Triage a backlog](tutorials/triage-a-backlog.md)
- [Plan and track a week](tutorials/plan-and-track-a-cycle.md)
