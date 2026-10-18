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

Instance configuration lives in `funnel.config.yaml` (git-ignored, per-instance).
Start from the annotated example:

```sh
cp funnel.config.example.yaml funnel.config.yaml
```

Only `repos` is required; every other key falls back to the defaults documented in
[docs/SPEC.md](docs/SPEC.md) §4 and §10. The file is loaded and validated at runtime by
`src/lib/server/config.ts` using [`c12`](https://github.com/unjs/c12) (YAML) and
[valibot](https://valibot.dev):

```ts
import { getConfig } from "#lib/server/config.js";

const config = await getConfig(); // validated, cached, defaults applied
config.github.api_url; // https://api.github.com
config.repos; // ["orgA/core", ...]
```

The optional top-level `projects` list maps GitHub labels to project names and
enables the **Project** group-by option in the issue feeds:

```yaml
projects:
  - label: project1
    name: Project One
```

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
| `BODY_SIZE_LIMIT` | `512K` | Max request body (sufficient for intake) |
| `SHUTDOWN_TIMEOUT` | `30` | Graceful shutdown window in seconds |

