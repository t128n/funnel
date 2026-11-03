<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Master–detail split. Above 992px the feed keeps a fixed 26rem column and
	 * the document canvas takes the rest. Below that, only one surface is shown
	 * at a time: the feed is full width, and opening an issue replaces it with
	 * the full-width detail route.
	 */
	interface Props {
		/** Whether a child route selected something; drives the responsive layout. */
		detailOpen: boolean;
		/** The feed column. */
		feed: Snippet;
		/** The detail canvas. */
		detail: Snippet;
	}

	let { detailOpen, feed, detail }: Props = $props();
</script>

<div class="split-view" class:split-view--detail-open={detailOpen}>
	<section class="split-view__feed">
		{@render feed()}
	</section>

	<aside class="split-view__detail">
		{@render detail()}
	</aside>
</div>
