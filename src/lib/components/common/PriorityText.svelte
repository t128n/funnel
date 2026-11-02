<script lang="ts">
	import { cn } from "#lib/utils";

	interface Props {
		priority?: string | null;
		/** Render the level name beside the token. */
		showName?: boolean;
		class?: string;
	}

	let { priority = null, showName = false, class: className }: Props = $props();

	const meta = $derived(
		priority === "P1"
			? { name: "High", tone: "status-error" }
			: priority === "P2"
				? { name: "Medium", tone: "status-warning" }
				: priority === "P3"
					? { name: "Low", tone: "status-muted" }
					: null
	);
</script>

{#if priority && meta}
	<span
		class={cn("status font-semibold", meta.tone, className)}
		title={`${priority} · ${meta.name} priority`}
	>
		<span aria-hidden="true">{priority}</span>
		{#if showName}
			<span>{meta.name}</span>
		{/if}
		<span class="sr-only">, {meta.name} priority</span>
	</span>
{/if}
