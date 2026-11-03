<script lang="ts">
	import type { LayoutProps } from './$types';

	/**
	 * Composition A renders `/matrix` as one page: the grid owns the screen and
	 * legacy `/matrix/<owner>/<repo>/<n>` links 307-redirect to the dedicated
	 * `/issues/...` document. With no docked detail pane left, the layout is
	 * only the shared data boundary (see `+layout.server.ts`).
	 */
	let { children }: LayoutProps = $props();
</script>

{@render children()}
