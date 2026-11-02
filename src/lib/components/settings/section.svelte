<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils';

	/**
	 * A ruled settings section: 1.25 rem heading, 1 px top rule, no container.
	 * A `fieldset` without a legend keeps the grouping semantics while allowing
	 * the rule to sit above the h2; `aria-labelledby` names the group.
	 */
	interface Props {
		title: string;
		description?: string;
		danger?: boolean;
		class?: string;
		children: Snippet;
	}

	let { title, description, danger = false, class: className, children }: Props = $props();

	const headingId = $props.id();
</script>

<fieldset
	aria-labelledby={headingId}
	class={cn(
		'min-w-0 w-full border-t border-border-subtle pt-4',
		danger && 'border-error',
		className
	)}
>
	<h2
		id={headingId}
		class={cn(
			'text-heading-sm font-semibold leading-heading-sm',
			danger ? 'text-error' : 'text-fg'
		)}
	>
		{title}
	</h2>
	{#if description}
		<p class="mt-1 max-w-[var(--layout-form-max)] text-body leading-body text-fg-secondary">
			{description}
		</p>
	{/if}
	<div class="mt-4 flex min-w-0 flex-col gap-6">
		{@render children()}
	</div>
</fieldset>
