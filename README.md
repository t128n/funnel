# Funnel

Funnel is a self-hosted GitHub issue cockpit: a dense, keyboard-friendly triage desk over the issues in the repositories you choose, with a public intake queue in front of it and a GitHub App created in-app during first-run onboarding.

## What it does

- **Intake before GitHub.** Anyone who can reach the instance can submit an issue at `/intake` (or through `POST /api/intake`). Submissions are staged in SQLite; nothing is created on GitHub until a triager accepts one. Accept, dismiss, or fold a submission into an existing issue as a duplicate.
- **One inbox for two queues.** The Inbox combines staged submissions with untriaged open issues — open issues that carry no status label. Setting a status moves an issue out of the queue and into the cockpit.
- **A local mirror, not a proxy.** Funnel polls the selected repositories in the background and serves every read from its own SQLite mirror, so filters, search, grouping, and the board stay fast and do not spend GitHub API calls on page loads.
- **Milestones, scoped the way GitHub scopes them.** The Milestones view lists each configured repository's milestones with progress and due dates, and each opens the issues attached to it. Milestones are also a filter and group-by dimension, an issue-row chip, and a set-or-clear picker in the inspector that can create a milestone lazily in that repository.
- **A workflow vocabulary, not free-form labels.** Reserved labels describe status (`backlog`, `todo`, `in-progress`, `in-review`), impact (`sev`, `mod`, `min`), urgency (`high`, `mid`, `low`), size (`sm`, `md`, `lg`), and the orthogonal `blocked` flag. Funnel keeps at most one label per group and provisions the vocabulary in each configured repository. Priority (P1–P3) is derived from impact × urgency and is never a GitHub label.
- **Board and Attention.** The board has Todo, In Progress, In Review, and Done lanes, with Backlog as a separate list; cards drag between open lanes and Done closes with a resolution. Blocked issues with a re-check date surface in Attention, bucketed as overdue, due today, and the next seven days.
- **An inspector that remembers context.** Read and edit an issue, comment, close or reopen with a required note, record a structured blocker, keep internal work notes that stay in Funnel until you publish them, and attach files to a dropbox stored outside the mirror.
- **Roles that are enforced server-side.** `read` can browse, `write` can mutate issues and triage intake, and `admin` manages instance settings and people. New accounts start as `read`; the first account to sign in becomes `admin`.
- **GitHub App onboarding in the app.** The App and its credentials are created through GitHub's App Manifest Flow, then installed from GitHub's own installation page. There are no GitHub App client IDs, secrets, or private keys in the environment.

## Requirements

| Requirement | Notes |
| :--- | :--- |
| Bun 1.4.3 or newer | The server must run under Bun. The database layer uses `bun:sqlite`, so `node build/index.js` does not work. |
| A GitHub account | Sign-in uses GitHub OAuth through the App. |
| Permission to create and install a GitHub App | Either on your personal account or on an organisation you administer. GitHub Enterprise Server is supported through the `GITHUB_URL` / `GITHUB_API_URL` settings. |

SQLite is embedded (through Bun); there is no separate database server to install.

## Quickstart

```sh
# 1. Install dependencies
bun install

# 2. Create your local environment file
cp .env.example .env

# 3. Generate an encryption secret and paste it into .env as FUNNEL_SECRET
openssl rand -base64 32

# 4. Apply the committed database schema
bun run release

# 5. Start the development server
bun run dev
```

Open <http://localhost:5173/onboarding>. A fresh instance redirects every user-facing route to the wizard until a GitHub App exists. The wizard creates the App, installs it, lets you choose repositories, and then sends you to sign in. The first account to sign in is promoted to `admin`.

`FUNNEL_URL` may stay empty in local development: Funnel uses the request origin for the App's callback and setup URLs. Set it to the public origin when the instance is reached through a hostname or proxy.

> The GitHub App is created in-app, not through environment variables. Funnel stores the App ID, client ID and secret, webhook secret, and RSA key in its database, encrypted under `FUNNEL_SECRET`.

## Production

Funnel is a single long-lived process that owns a SQLite database and an uploads directory. It must not be scaled horizontally or deployed to a serverless target: the background polling worker, nightly reconciliation, and the SSE stream all depend on the process staying up.

| Delivery path | Build | Notes |
| :--- | :--- | :--- |
| Standalone executable | `mise run exe` → `dist/funnel` (or `dist\funnel.exe`) | Self-contained: Bun runtime, server, client assets, migrations, and the native Markdown addon. |
| Desktop intake helper | `mise run intake:exe`, then `scripts\install-intake.ps1` | Optional per-user Windows helper: a global hotkey opens a prefilled `/intake` draft for the current selection. See [`scripts/README.md`](scripts/README.md). |
| Container | `mise run docker` or `docker build -t funnel .` | Wraps the same Linux executable; mount a volume at `/data` for the database and uploads. |
| Windows service | `mise run exe`, then `packaging\windows\install-service.ps1` | WinSW wrapper; state lives in `C:\ProgramData\Funnel`. |
| Adapter-node build | `bun run build`, then `bun run release` and `bun run start` | `bun ./build/index.js`; still a long-lived process. Run the release step against the same `FUNNEL_DB` first — this path does not migrate on boot. |

The packaged executable (and therefore the container) applies pending migrations on boot. Health probes are `/healthz` (liveness) and `/readyz` (readiness; it reports `503` until every committed migration is applied). `funnel --help`, `--version`, `--migrate`, and `--healthcheck` cover the packaged binary's CLI.

If you build with mise, run `mise trust` once per checkout so its tasks load.

The **desktop intake helper** is optional and Windows-only. It runs per user, starts at login, and owns its global hotkey directly instead of relying on a Start Menu `.lnk`:

```powershell
mise run intake:exe
powershell -ExecutionPolicy Bypass -File scripts\install-intake.ps1
```

Configuration, the hotkey syntax, and troubleshooting live in [`scripts/README.md`](scripts/README.md); the Go library and URL contract live in [`tools/funnel-intake/README.md`](tools/funnel-intake/README.md) and [`docs/how-to/integrate/windows-intake-hotkey.md`](docs/how-to/integrate/windows-intake-hotkey.md).

## Documentation

Start at the [documentation index](docs/README.md), or jump straight in:

| I want to… | Read |
| :--- | :--- |
| Install Funnel and reach the cockpit | [Getting started](docs/tutorials/getting-started.md) |
| Follow a full triage cycle from intake to reopen | [Triage a backlog](docs/tutorials/triage-a-backlog.md) |
| Deploy, operate, or configure an instance | [How-to guides](docs/README.md#how-to-guides) |
| Look up environment variables, settings, routes, or the API | [Reference](docs/README.md#reference) |
| Understand the architecture or workflow model | [Explanation](docs/README.md#explanation) |
| See the UI design standards | [DESIGN.md](docs/DESIGN.md) |

## Related

- [Documentation index](docs/README.md)
- [Getting started tutorial](docs/tutorials/getting-started.md)
- [Triage a backlog tutorial](docs/tutorials/triage-a-backlog.md)
- [Design standards](docs/DESIGN.md)
