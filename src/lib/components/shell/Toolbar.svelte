<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		children: Snippet;
		/** Trailing controls that should sit on the same baseline. */
		actions?: Snippet;
	}

	let { children, actions }: Props = $props();
</script>

<div
	class="flex flex-wrap items-end gap-4 border-b border-border-subtle px-[var(--layout-page-padding)] py-3"
>
	<div class="flex min-w-0 flex-1 flex-wrap items-end gap-4">
		{@render children()}
	</div>
	{#if actions}
		<div class="flex shrink-0 flex-wrap items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
