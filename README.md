# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@1.1.1 create --template minimal --types ts --install bun .
```

## Adding features

Add features to your project with `sv add`:

```sh
npx sv add
```

For example, to add Tailwind CSS:

```sh
npx sv add tailwindcss
```

## Configuration

Instance configuration is stored in the SQLite database and edited from the
**Settings** page (`/settings`) after signing in. Repositories, projects, the
intake default, sync cadence, board behaviour, and session lifetime all live in
the `state_setting` table; writes are validated and applied without a restart
(the sync scheduler re-reads config; open cockpits refresh over SSE).

A fresh install starts with no repositories — pick them during onboarding or
add them on the Settings page.

Deploy-time values come from the environment (see `.env.example`):

- `GITHUB_URL` / `GITHUB_API_URL` — the GitHub host. Defaults to
  github.com; set both to your host for GitHub Enterprise Server.
- `FUNNEL_URL`, `FUNNEL_SECRET`, `FUNNEL_DB`, `FUNNEL_ONBOARDING_TOKEN`,
  and `LOG_LEVEL`.

The **GitHub App** is not configured through environment variables. A fresh
install gates every route to **`/onboarding`**, which walks through GitHub's
[App Manifest Flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest):
create the App (personal, organization, or a GitHub Enterprise host), exchange
the one-time code for credentials, then install it and pick repositories. The
App id, client id/secret, webhook secret, and RSA key are stored in the
`state_github_app` table with the secrets encrypted under `FUNNEL_SECRET`.
Manage the App afterwards in **Settings → GitHub App**.

Reads stay programmatic and are unchanged:

```ts
import { getConfig } from "#lib/server/config.js";

const config = await getConfig(); // validated, cached, defaults applied
config.github.api_url; // https://api.github.com
config.repos; // [{ repo: "orgA/core", shortcode: "CORE" }, ...]
```

The **Projects** list on the Settings page maps GitHub labels to project names
and enables the **Project** group-by option in the issue feeds.

The issue inspector also carries Funnel-local, internal-only **work notes**
(ITSM-style journal entries that stay in Funnel until explicitly published —
publishing posts the note as a GitHub comment and removes it from the internal
journal) and a **dropbox** for attaching files to an issue. Both
live in durable `state_*` tables keyed by `owner/name` + issue number, so they
survive mirror pruning and re-sync; attachment bytes are written under
`FUNNEL_UPLOAD_DIR`. Either surface can be hidden per browser or instance from
**Settings > Features**.

## Developing

Install dependencies and start the development server:

```sh
bun install
bun run dev
```

## Building

Funnel builds to a standalone single-process server with
[`@sveltejs/adapter-node`](https://svelte.dev/docs/kit/adapter-node). A long-lived
process is required: the background polling worker, the nightly reconciliation
timer, and the `/api/events` SSE stream cannot survive on a serverless target.

```sh
bun run build
bun run start   # bun ./build/index.js
```

The server **must run under Bun** — the database layer uses `bun:sqlite`, so
`node build/index.js` will not work. Production `dependencies` are kept external
by the adapter, so `node_modules` must be installed alongside `build/`.

Server configuration is read from the environment by the adapter:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `ORIGIN` | — | Public origin, e.g. `https://funnel.example.com` (set to `FUNNEL_URL`) |
| `PROTOCOL_HEADER` / `HOST_HEADER` | — | Forwarded proto/host when behind a TLS-terminating proxy |
| `BODY_SIZE_LIMIT` | `512K` | Max request body. Raise it to cover issue attachment uploads |
| `FUNNEL_UPLOAD_DIR` | `./data/uploads` | Where uploaded issue attachments are stored |
| `FUNNEL_UPLOAD_MAX_BYTES` | `10485760` | Max size of a single attachment (10 MiB) |
| `SHUTDOWN_TIMEOUT` | `30` | Graceful shutdown window in seconds |

Uploads larger than `BODY_SIZE_LIMIT` are rejected before they reach Funnel, so
set it at least as large as `FUNNEL_UPLOAD_MAX_BYTES` when using the dropbox.

