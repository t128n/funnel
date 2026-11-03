<script lang="ts">
	import type { Snippet } from 'svelte';
	import { codeBlocks } from '#lib/client/code-blocks';
	import { mermaidDiagrams } from '#lib/client/mermaid';

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
		/** The pane's root element, for callers that scope behavior to the pane. */
		element?: HTMLElement | null;
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
		class: className = '',
		contentKey,
		wide = false,
		element = $bindable(null),
		header,
		footer,
		aside,
		children
	}: Props = $props();

	const measure = $derived(wide ? 'detail-measure detail-measure--wide' : 'detail-measure');
</script>

<aside bind:this={element} class="d-flex h-100 flex-column bg-body {className}" aria-label={ariaLabel}>
	<header class="flex-shrink-0 border-bottom">
		<div class="{measure} d-flex align-items-center justify-content-between gap-2 px-3 py-2">
			{@render header()}
		</div>
	</header>

	<div class="min-h-0 flex-grow-1 overflow-y-auto">
		<div
			class="{measure} detail-body px-3 py-4 {aside
				? ''
				: 'd-flex min-vh-100 flex-column gap-4'}"
			use:codeBlocks={contentKey}
			use:mermaidDiagrams={contentKey}
		>
			{#if aside}
				<div class="detail-with-aside">
					<div class="d-flex min-w-0 flex-column gap-4">{@render children()}</div>
					<div class="d-flex min-w-0 flex-column gap-4">{@render aside()}</div>
				</div>
			{:else}
				{@render children()}
			{/if}
		</div>
	</div>

	{#if footer}
		<footer class="flex-shrink-0 border-top bg-body">
			<div class="{measure} px-3 py-2">
				{@render footer()}
			</div>
		</footer>
	{/if}
</aside>
