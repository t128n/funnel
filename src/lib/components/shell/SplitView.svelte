<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils';

	/**
	 * Master–detail split. Above 1024px the feed keeps a fixed 26rem column and
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

<div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
	<section
		class={cn(
			'flex min-h-0 flex-col overflow-hidden bg-canvas',
			detailOpen
				? 'hidden lg:flex lg:w-[var(--layout-feed)] lg:shrink-0 lg:border-r lg:border-border-subtle'
				: 'w-full flex-1 lg:w-[var(--layout-feed)] lg:flex-none lg:border-r lg:border-border-subtle'
		)}
	>
		{@render feed()}
	</section>

	<aside
		class={cn(
			'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas',
			!detailOpen && 'hidden lg:flex'
		)}
	>
		{@render detail()}
	</aside>
</div>
