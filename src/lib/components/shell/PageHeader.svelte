<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Composition A page header: a quiet `h3`-scale title, an optional muted
	 * count, one description line, and right-aligned page actions. Containers
	 * own the horizontal gutter, so the header adds only vertical rhythm.
	 */
	interface Props {
		title: string;
		description?: string;
		/** Live count or scope summary shown beside the title. */
		count?: string | number;
		/** Demote the title to h2 when a detail document owns the screen h1. */
		level?: 1 | 2;
		/** Primary and secondary page actions, right-aligned on the title baseline. */
		actions?: Snippet;
		class?: string;
		/** Layout classes for the action cluster (for example responsive growth). */
		actionsClass?: string;
	}

	let {
		title,
		description,
		count,
		level = 1,
		actions,
		class: className = '',
		actionsClass = ''
	}: Props = $props();
</script>

<header class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3 {className}">
	<div class="min-w-0">
		<div class="d-flex flex-wrap align-items-baseline gap-2">
			<svelte:element
				this={level === 1 ? 'h1' : 'h2'}
				class={level === 1 ? 'h3 mb-0' : 'h4 mb-0'}
			>
				{title}
			</svelte:element>
			{#if count !== undefined && count !== ''}
				<span class="fs-6 fw-normal text-body-secondary">{count}</span>
			{/if}
		</div>
		{#if description}
			<p class="mb-0 mt-1 text-body-secondary">{description}</p>
		{/if}
	</div>

	{#if actions}
		<div class="d-flex flex-wrap align-items-center gap-2 {actionsClass}">
			{@render actions()}
		</div>
	{/if}
</header>
