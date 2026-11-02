<script lang="ts">
	/**
	 * Quiet instruction for a view's detail column: shown at the base URL before
	 * an item is selected (and when a detail link does not resolve). It is a
	 * caption in the reading position, not a centered empty-state hero.
	 */
	interface Props {
		title?: string;
		description?: string;
	}

	let {
		title = '',
		description = 'Select an item to view its details.'
	}: Props = $props();
</script>

<div class="flex h-full items-start px-[var(--layout-page-padding)] py-6">
	<p class="max-w-[var(--layout-measure)] text-body leading-body text-fg-secondary">
		{#if title}
			<span class="font-semibold text-fg">{title}.</span>
		{/if}
		{description}
	</p>
</div>
