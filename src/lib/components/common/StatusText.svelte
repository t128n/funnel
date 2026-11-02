<script lang="ts">
	import BanIcon from "@lucide/svelte/icons/ban";
	import CircleIcon from "@lucide/svelte/icons/circle";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleDashedIcon from "@lucide/svelte/icons/circle-dashed";
	import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import { cn } from "#lib/utils";

	interface Props {
		status?: string | null;
		state?: string | null;
		blocked?: boolean;
		class?: string;
	}

	let { status = null, state = null, blocked = false, class: className }: Props = $props();

	const word = $derived(
		blocked
			? "Blocked"
			: state === "closed"
				? "Closed"
				: status === "open"
					? "Open"
					: status === "done"
						? "Done"
					: status === "in-progress"
						? "In progress"
						: status === "in-review"
							? "In review"
							: status === "backlog"
								? "Backlog"
								: status === "todo"
									? "Todo"
									: "Unconfirmed"
	);

	const tone = $derived(
		blocked
			? "status-error"
			: state === "closed" || status === "done"
				? "status-success"
				: status === "in-progress" || status === "in-review"
					? "status-warning"
					: "status-muted"
	);
</script>

<span class={cn("status", tone, className)}>
	{#if blocked}
		<BanIcon aria-hidden="true" />
	{:else if state === "closed" || status === "done"}
		<CircleCheckIcon aria-hidden="true" />
	{:else if status === "in-progress"}
		<CircleDotIcon aria-hidden="true" />
	{:else if status === "in-review"}
		<EyeIcon aria-hidden="true" />
	{:else if status === "backlog"}
		<CircleDashedIcon aria-hidden="true" />
	{:else}
		<CircleIcon aria-hidden="true" />
	{/if}
	<span>{word}</span>
</span>
