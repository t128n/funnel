<script lang="ts">
	import type { Snippet } from 'svelte';

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

	let { title, description, danger = false, class: className = '', children }: Props = $props();

	const headingId = $props.id();
</script>

<fieldset
	aria-labelledby={headingId}
	class="min-w-0 w-100 border-top pt-3 {danger ? 'border-danger' : ''} {className}"
>
	<h2 id={headingId} class="h5 {danger ? 'text-danger' : ''}">{title}</h2>
	{#if description}
		<p class="mt-1 mb-0 form-measure text-body-secondary">{description}</p>
	{/if}
	<div class="mt-3 d-flex min-w-0 flex-column gap-4">
		{@render children()}
	</div>
</fieldset>
