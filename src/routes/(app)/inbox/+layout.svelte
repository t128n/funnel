<script lang="ts">
	import type { LayoutProps } from './$types';

	/**
	 * Composition A has no split Inbox pane: `/inbox` owns the queue table and
	 * `/inbox/submission/<id>` is a standalone review page. The layout stays a
	 * pass-through so both routes render inside the normal app `<main>`.
	 *
	 * The layout server still loads the mixed feed because the submission page
	 * resolves its entry from that queue.
	 */
	let { children }: LayoutProps = $props();
</script>

{@render children()}
