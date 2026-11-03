<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		/** Trailing controls that should sit on the same baseline. */
		actions?: Snippet;
		/** Override the page gutter, e.g. a narrower split-view feed column. */
		class?: string;
	}

	let { children, actions, class: className = '' }: Props = $props();
</script>

<div class="d-flex flex-wrap align-items-end gap-3 border-bottom px-3 py-2 {className}">
	<div class="d-flex min-w-0 flex-grow-1 flex-wrap align-items-end gap-3">
		{@render children()}
	</div>
	{#if actions}
		<div class="d-flex flex-shrink-0 flex-wrap align-items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
