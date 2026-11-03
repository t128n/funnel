<script lang="ts">
	import type { LayoutProps } from './$types';

	/**
	 * Composition A renders the issue index and the issue document as separate
	 * pages. The layout only carries the app shell through to both; it does not
	 * own the feed or any index chrome.
	 */
	let { children }: LayoutProps = $props();
</script>

{@render children()}
