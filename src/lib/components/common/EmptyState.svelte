<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		description?: string;
		action?: Snippet;
		class?: string;
	}

	let { title, description, action, class: className = '' }: Props = $props();
</script>

<div class="d-flex flex-column align-items-center justify-content-center gap-2 py-5 text-center {className}">
	{#if title}
		<p class="fw-semibold mb-0">{title}</p>
	{/if}
	{#if description}
		<p class="text-body-secondary mb-0">{description}</p>
	{/if}
	{#if action}
		<div class="mt-1">{@render action()}</div>
	{/if}
</div>
