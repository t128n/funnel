<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A single conventional Bootstrap toolbar row. Composition A keeps search
	 * and filters in one row; pages that need a strict column grid use their own
	 * `row g-2` markup instead.
	 */
	interface Props {
		children: Snippet;
		/** Trailing controls that should sit on the same baseline. */
		actions?: Snippet;
		class?: string;
	}

	let { children, actions, class: className = '' }: Props = $props();
</script>

<div class="d-flex flex-wrap align-items-center gap-2 mb-3 {className}">
	<div class="d-flex min-w-0 flex-grow-1 flex-wrap align-items-center gap-2">
		{@render children()}
	</div>
	{#if actions}
		<div class="d-flex flex-shrink-0 flex-wrap align-items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
