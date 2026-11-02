<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		title: string;
		description?: string;
		/** Live count or scope summary shown beside the title. */
		count?: string | number;
		/** Primary and secondary page actions, right-aligned on the title baseline. */
		actions?: Snippet;
	}

	let { title, description, count, actions }: Props = $props();
</script>

<header
	class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-[var(--layout-page-padding)] pb-4 pt-5"
>
	<div class="min-w-0">
		<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<h1
				class="min-w-0 text-heading-md font-semibold leading-heading-md tracking-[-0.01em] text-fg"
			>
				{title}
			</h1>
			{#if count !== undefined && count !== ""}
				<span class="text-body text-fg-secondary tabular-nums">{count}</span>
			{/if}
		</div>
		{#if description}
			<p class="mt-1 max-w-[var(--layout-measure)] text-body leading-body text-fg-secondary">
				{description}
			</p>
		{/if}
	</div>

	{#if actions}
		<div class="flex shrink-0 flex-wrap items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</header>
