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

<div class="d-flex align-items-start px-3 py-4">
	<p class="measure text-body-secondary mb-0">
		{#if title}
			<strong class="text-body">{title}.</strong>
		{/if}
		{description}
	</p>
</div>
