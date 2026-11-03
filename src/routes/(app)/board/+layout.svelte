<script lang="ts">
	import type { LayoutProps } from './$types';

	/**
	 * Composition A renders `/board` as one page: the board/backlog canvas owns
	 * the screen, and legacy `/board/<owner>/<repo>/<n>` links 307-redirect to
	 * the dedicated `/issues/...` document. There is no docked detail pane, so
	 * the layout is only the shared data boundary (see `+layout.server.ts`).
	 */
	let { children }: LayoutProps = $props();
</script>

{@render children()}
