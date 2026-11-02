<script lang="ts">
	import type { Snippet } from "svelte";
	import * as Empty from "#lib/components/ui/empty";

	interface Props {
		title?: string;
		description?: string;
		action?: Snippet;
		class?: string;
	}

	let { title, description, action, class: className }: Props = $props();
</script>

<Empty.Root class={className}>
	{#if title}
		<Empty.Title>{title}</Empty.Title>
	{/if}
	{#if description}
		<Empty.Description>{description}</Empty.Description>
	{/if}
	{#if action}
		<div class="mt-1">{@render action()}</div>
	{/if}
</Empty.Root>
