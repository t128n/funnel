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
| Put Funnel into production | [Deploy with Docker](how-to/deploy/docker.md), [Windows service](how-to/deploy/windows-service.md), [reverse proxy](how-to/deploy/reverse-proxy.md), or [GitHub Enterprise Server](how-to/deploy/github-enterprise-server.md) |
| Back up, upgrade, or fix an instance | [Backup and restore](how-to/operate/backup-and-restore.md), [upgrade](how-to/operate/upgrade.md), [troubleshoot](how-to/operate/troubleshoot.md) |
| Configure the App, repositories, projects, people, or sync | [Configure Funnel](#configure) |
| Work an issue queue day to day | [Use the cockpit](#use) |
| Call the intake API or hook up a Windows hotkey | [Integrate](#integrate) |
| Build, test, or release Funnel | [Contribute](#contribute) |
| Find an exact setting, route, label, or command | [Reference](#reference) |
| Understand the architecture or workflow | [Explanation](#explanation) |

## Tutorials

Learning-oriented, with one path and expected results.

- [Getting started](tutorials/getting-started.md) — install Bun, run Funnel locally, create and install the GitHub App through onboarding, and reach the cockpit.
- [Triage a backlog](tutorials/triage-a-backlog.md) — stage an intake submission, accept it into a repository, triage an issue, move a board card, block it, add and publish a work note, attach a file, then close and reopen.

## How-to guides

### Deploy

- [Deploy with Docker](how-to/deploy/docker.md) — build and run the container with a persistent `/data` volume.
- [Install as a Windows service](how-to/deploy/windows-service.md) — install the standalone executable under WinSW and manage its lifecycle.
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

### Use

- [Triage intake](how-to/use/triage-intake.md) — accept, dismiss, or duplicate a staged submission.
- [Create and edit issues](how-to/use/create-and-edit-issues.md) — create an issue, then edit its title, description, properties, assignees, and labels.
- [Close, reopen, and block](how-to/use/close-reopen-block.md) — record resolutions, reopen notes, and structured blockers with re-check dates.
- [Use the board](how-to/use/board.md) — drag cards, switch to the Backlog list, and use the Done lane.
- [Use milestones](how-to/use/milestones.md) — browse repo-scoped milestones, filter and group by them, and set or create one from an issue.
- [Work notes and attachments](how-to/use/work-notes-and-attachments.md) — keep internal notes, publish them, and manage the file dropbox.
- [Keyboard shortcuts](how-to/use/keyboard.md) — the global and board bindings, plus arrow-key navigation.

### Integrate

- [Use the intake API](how-to/integrate/intake-api.md) — `POST /api/intake` with `title`, `body`, and `source`.
- [Set up the Windows intake hotkey](how-to/integrate/windows-intake-hotkey.md) — stage the current text selection from Teams or Outlook with a global shortcut.

### Contribute

- [Development](how-to/contribute/development.md) — set up a checkout, run the dev server, and find your way around the code.
- [Testing](how-to/contribute/testing.md) — run the Bun test suite, type checks, and build verification.
- [Release](how-to/contribute/release.md) — produce the executable, the container image, and the release checks.

## Reference

- [Environment variables](reference/environment-variables.md) — every deploy-time variable, its default, and its purpose.
- [CLI](reference/cli.md) — the packaged executable's flags and the Bun scripts it maps to.
- [Build tasks](reference/build-tasks.md) — the `mise` tasks and what each one produces.
- [Settings](reference/settings.md) — the instance settings stored in SQLite, with defaults and validation rules.
- [Reserved labels](reference/reserved-labels.md) — the canonical status, priority, size, and flag vocabulary.
- [Roles and permissions](reference/roles-and-permissions.md) — what `read`, `write`, and `admin` may do.
- [HTTP API](reference/http-api.md) — the intake endpoint, mutation endpoints, mirror reads, and health probes.
- [Database schema](reference/database-schema.md) — mirror tables, Funnel-owned state, and authentication tables.
- [Routes and pages](reference/routes-and-pages.md) — the public, onboarding, cockpit, settings, and API route map.
- [Feature flags](reference/feature-flags.md) — the flag keys, defaults, and per-browser overrides.
- [Glossary](reference/glossary.md) — the terms Funnel uses for intake, mirror, triage, and workflow.

## Explanation

- [Architecture](explanation/architecture.md) — the SvelteKit process, SQLite mirror, background worker, and SSE bridge.
- [Sync and mirror](explanation/sync-and-mirror.md) — polling, hydration, cursors, and what the mirror deliberately does not keep.
- [Workflow model](explanation/workflow-model.md) — status, priority, size, blocking, and Done as separate concepts.
- [Intake lifecycle](explanation/intake-lifecycle.md) — staging, accepting, dismissing, duplicating, and where history lives.
- [Security model](explanation/security-model.md) — sessions, encrypted credentials, role enforcement, and user-token writes.
- [Deployment model](explanation/deployment-model.md) — why Funnel is one long-lived process with local state.
- [Design principles](explanation/design-principles.md) — the density, keyboard, and interaction standards behind the cockpit.

## Project documents

- [DESIGN.md](DESIGN.md) — the Linear-inspired UI/UX standards: tokens, layouts, keyboard behaviour, and interaction details.
- [scripts/README.md](../scripts/README.md) — the Windows intake helpers, icon generator, and their current status.

## Conventions

Run commands from the repository root unless a document says otherwise. Paths in code fences are relative to that root. Environment variables are written in `UPPER_SNAKE_CASE`; settings keys use dotted names such as `sync.history_days`.

## Related

- [Funnel README](../README.md)
- [Getting started](tutorials/getting-started.md)
- [Triage a backlog](tutorials/triage-a-backlog.md)
