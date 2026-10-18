<script lang="ts">
	import type { Snippet } from 'svelte';
	import { codeBlocks } from '#lib/client/code-blocks';
	import { cn } from '#lib/utils';

	/**
	 * Shared document shell for the master–detail canvases (the Issue inspector
	 * and the Inbox submission pane): a fixed header bar, a scrolling body held
	 * to a comfortable reading measure, and an optional docked footer.
	 *
	 * Keeping the measure here is what stops code blocks and prose from
	 * stretching edge-to-edge when the pane takes the whole right column. The
	 * enhancer on the body column wires up code-block chrome for whatever
	 * `{@html}` renders inside it.
	 */
	interface Props {
		ariaLabel: string;
		/** Outer wrapper classes (width, borders, responsive behavior). */
		class?: string;
		/** Changing value that re-runs the code-block enhancer when body HTML swaps. */
		contentKey?: unknown;
		/** Header bar content, laid out space-between. */
		header: Snippet;
		/** Optional docked action bar; constrained to the same measure. */
		footer?: Snippet;
		children: Snippet;
	}

	let { ariaLabel, class: className, contentKey, header, footer, children }: Props = $props();

	const MEASURE = 'mx-auto w-full max-w-[760px]';
</script>

<aside class={cn('bg-background flex h-full flex-col', className)} aria-label={ariaLabel}>
	<header class="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
		{@render header()}
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<div
			class={cn(MEASURE, 'flex min-h-full flex-col gap-5 px-6 py-5')}
			use:codeBlocks={contentKey}
		>
			{@render children()}
		</div>
	</div>

	{#if footer}
		<footer class="bg-background shrink-0 border-t">
			<div class={cn(MEASURE, 'px-6 py-3')}>
				{@render footer()}
			</div>
		</footer>
	{/if}
</aside>
