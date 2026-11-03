<script lang="ts">
	import type { LayoutProps } from './$types';

	/**
	 * Composition A renders `/matrix` as one page: the page owns the grid,
	 * summary, selected cell detail and assessment queue. Legacy
	 * `/matrix/<owner>/<repo>/<n>` links 307-redirect to the dedicated
	 * `/issues/...` document, so this layout is only the shared data boundary
	 * (see `+layout.server.ts`).
	 */
	let { children }: LayoutProps = $props();
</script>

{@render children()}
