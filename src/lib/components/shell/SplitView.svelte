<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils';

	/**
	 * Master–detail split for the Inbox and Issues views: a fixed-width feed
	 * column on the left and a flexible document canvas on the right. The canvas
	 * is always present; with no selection it shows an empty state instead of
	 * collapsing the column.
	 *
	 * Both columns are supplied as snippets so the view's `+layout.svelte` owns
	 * its feed chrome and lets `{@render children()}` fill the detail canvas from
	 * the matched child route.
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

<div class="relative flex min-h-0 min-w-0 flex-1">
	<section
		class={cn(
			'flex w-96 shrink-0 flex-col overflow-hidden border-r',
			detailOpen && 'max-[1000px]:w-auto max-[1000px]:flex-1'
		)}
	>
		{@render feed()}
	</section>

	<!-- Below the widescreen breakpoint the detail canvas floats over the feed
	     rather than squeezing it. -->
	<aside
		class={cn(
			'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
			'max-[1000px]:bg-background max-[1000px]:absolute max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:z-40 max-[1000px]:w-[min(560px,100%)] max-[1000px]:border-l',
			!detailOpen && 'max-[1000px]:hidden'
		)}
	>
		{@render detail()}
	</aside>
</div>
