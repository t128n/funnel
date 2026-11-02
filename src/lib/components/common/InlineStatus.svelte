<script lang="ts">
	import type { Snippet } from "svelte";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import InfoIcon from "@lucide/svelte/icons/info";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { cn } from "#lib/utils";

	interface Props {
		tone?: "error" | "warning" | "success" | "info";
		message: string;
		action?: Snippet;
		class?: string;
	}

	let { tone = "info", message, action, class: className }: Props = $props();

	const color = $derived(
		tone === "error"
			? "text-error"
			: tone === "warning"
				? "text-warning"
				: tone === "success"
					? "text-success"
					: "text-fg-secondary"
	);
</script>

<div
	class={cn("flex min-w-0 items-start gap-2 text-body", color, className)}
	role={tone === "error" ? "alert" : "status"}
>
	{#if tone === "success"}
		<CircleCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
	{:else if tone === "error"}
		<CircleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
	{:else if tone === "warning"}
		<TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
	{:else}
		<InfoIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
	{/if}
	<span class="min-w-0 flex-1">{message}</span>
	{#if action}
		<div class="shrink-0">{@render action()}</div>
	{/if}
</div>
