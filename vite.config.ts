import { readFileSync } from 'node:fs';

import tailwindcss from '@tailwindcss/vite';

// adapter-node produces a long-lived Node server (run with `bun ./build/index.js`),
// so in-process background timers and SSE streams are not killed the way a
// serverless target would kill them.
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const { version } = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

export default defineConfig({
	// Surfaced in the intake footer; keep it out of SvelteKit's `version.name`
	// so build-update detection keeps its own (build-unique) value.
	define: {
		__APP_VERSION__: JSON.stringify(version)
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	]
});
