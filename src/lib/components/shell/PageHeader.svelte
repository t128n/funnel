<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "#lib/utils";

	interface Props {
		title: string;
		description?: string;
		/** Live count or scope summary shown beside the title. */
		count?: string | number;
		/** Demote the title to h2 when a split-view detail owns the screen h1. */
		level?: 1 | 2;
		/** Primary and secondary page actions, right-aligned on the title baseline. */
		actions?: Snippet;
		/** Override the page gutter, e.g. a narrower split-view feed column. */
		class?: string;
	}

	let { title, description, count, level = 1, actions, class: className }: Props = $props();
</script>

<header
	class={cn(
		"flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-[var(--layout-page-padding)] pb-4 pt-5",
		className
	)}
>
	<div class="min-w-0">
		<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<svelte:element
				this={level === 1 ? "h1" : "h2"}
				class={level === 1
					? "min-w-0 text-heading-md font-semibold leading-heading-md tracking-[-0.01em] text-fg"
					: "min-w-0 text-heading-sm font-semibold leading-heading-sm text-fg"}
			>
				{title}
			</svelte:element>
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
