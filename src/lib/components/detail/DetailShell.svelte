<script lang="ts">
	import type { Snippet } from 'svelte';
	import { codeBlocks } from '#lib/client/code-blocks';
	import { mermaidDiagrams } from '#lib/client/mermaid';
	import { cn } from '#lib/utils';

	/**
	 * Shared document shell for the master–detail canvases (the Issue inspector
	 * and the Inbox submission pane): a fixed header bar, a scrolling body held
	 * to a comfortable reading measure, and an optional docked footer.
	 *
	 * Keeping the measure here is what stops code blocks and prose from
	 * stretching edge-to-edge when the pane takes the whole right column. The
	 * enhancers on the body column wire up code-block chrome and render Mermaid
	 * diagrams for whatever `{@html}` puts inside it.
	 */
	interface Props {
		ariaLabel: string;
		/** Outer wrapper classes (width, borders, responsive behavior). */
		class?: string;
		/** Changing value that re-runs the enhancers when body HTML swaps. */
		contentKey?: unknown;
		/** Allow a wider measure than the reading column (two-column bodies). */
		wide?: boolean;
		/** Header bar content, laid out space-between. */
		header: Snippet;
		/** Optional docked action bar; constrained to the same measure. */
		footer?: Snippet;
		/**
		 * Optional secondary column. When present, the body becomes a
		 * container-query grid: a single stacked column on narrow panes, and a
		 * two-column split (primary + aside) once the pane is wide enough.
		 */
		aside?: Snippet;
		children: Snippet;
	}

	let {
		ariaLabel,
		class: className,
		contentKey,
		wide = false,
		header,
		footer,
		aside,
		children
	}: Props = $props();

	const MEASURE = $derived(
		wide ? 'mx-auto w-full max-w-[1200px]' : 'mx-auto w-full max-w-[760px]'
	);
</script>

<aside class={cn('bg-background flex h-full flex-col', className)} aria-label={ariaLabel}>
	<header class="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5">
		{@render header()}
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<div
			class={cn(MEASURE, 'px-6 py-5', aside ? '@container min-h-full' : 'flex min-h-full flex-col gap-5')}
			use:codeBlocks={contentKey}
			use:mermaidDiagrams={contentKey}
		>
			{#if aside}
				<div
					class="grid grid-cols-1 items-start gap-x-10 gap-y-5 @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
				>
					<div class="flex min-w-0 flex-col gap-5">{@render children()}</div>
					<div class="flex min-w-0 flex-col gap-5">{@render aside()}</div>
				</div>
			{:else}
				{@render children()}
			{/if}
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
