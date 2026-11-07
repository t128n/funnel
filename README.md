# Funnel

Funnel is a self-hosted GitHub issue cockpit with a public intake queue and a local mirror of the repositories you choose. Triage submissions, manage issues and plan work from one place.

## Install on Windows

1. Open the [Funnel releases](https://github.com/t128n/funnel/releases) and download the Windows x64 ZIP for the release you want.
2. Extract the ZIP on the Windows machine that will run Funnel. Open PowerShell in the extracted folder and run `.\funnel.exe setup`. Alternatively, open `setup.cmd` if the archive contains it.
3. Follow the setup prompts, then open the onboarding URL printed by the wizard. Create and install the GitHub App, select repositories, and sign in. The first account to sign in becomes an administrator.
4. Start with [triaging a backlog](docs/tutorials/triage-a-backlog.md) or [creating and editing issues](docs/how-to/use/create-and-edit-issues.md).

You need a GitHub account with permission to create and install a GitHub App. For requirements, service options, other platforms and troubleshooting, see [Install Funnel](docs/how-to/deploy/install.md). The executable includes its runtime; installing Bun or cloning the repository is not required for this path.

## What Funnel does

- **Intake and triage:** Submissions to `/intake` or the intake API are staged in SQLite until a triager accepts, dismisses, or marks them as duplicates. The Inbox combines these submissions with untriaged GitHub issues.
- **A local issue mirror:** Funnel polls selected repositories and serves reads from SQLite, supporting search, filters, grouping and the board without a GitHub API call for each page load.
- **A shared workflow:** Reserved labels track status, impact, urgency, size and blocking; priority is derived from impact and urgency. The board organizes work by status, while Attention surfaces work needing review.
- **Issue details and planning:** Edit issues, comment, record blockers, keep internal work notes and attach files. Plan work by week, browse repository milestones, and view dated milestones on the `/timeline` Gantt.
- **Access and onboarding:** The first-run wizard creates and installs a GitHub App. Server-enforced `read`, `write` and `admin` roles control access; new accounts start with `read`.

## Use and operate Funnel

- [Triage intake](docs/how-to/use/triage-intake.md), [use the board](docs/how-to/use/board.md), or [plan a week](docs/how-to/use/plan-work.md).
- [Configure repositories](docs/how-to/configure/repositories.md) and [manage people and roles](docs/how-to/configure/people-and-roles.md).
- [Back up and restore](docs/how-to/operate/backup-and-restore.md), [upgrade](docs/how-to/operate/upgrade.md), or [troubleshoot](docs/how-to/operate/troubleshoot.md).
- Install on [Linux with systemd](docs/how-to/deploy/linux-systemd.md), [behind a reverse proxy](docs/how-to/deploy/reverse-proxy.md), or against [GitHub Enterprise Server](docs/how-to/deploy/github-enterprise-server.md).
- Set up the optional [desktop intake app](docs/how-to/integrate/windows-intake-hotkey.md) on Windows or macOS for hotkey-based submission drafts.
- Browse the [documentation site](https://t128n.github.io/funnel/) or [GitHub documentation index](docs/README.md).

Funnel runs as a single long-lived process with a SQLite database and uploads directory. Do not run multiple instances against the same data directory; see the [deployment model](docs/explanation/deployment-model.md).

## Contribute

To change Funnel rather than install a release, clone the repository and follow the [development guide](docs/how-to/contribute/development.md) to set up dependencies and run the app. Run the checks in the [testing guide](docs/how-to/contribute/testing.md), then submit your changes as a pull request. See the [release guide](docs/how-to/contribute/release.md) for building release artifacts.
