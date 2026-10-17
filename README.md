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

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
