import tailwindcss from '@tailwindcss/vite';

// adapter-node produces a long-lived Node server (run with `bun ./build/index.js`),
// so in-process background timers and SSE streams are not killed the way a
// serverless target would kill them.
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
