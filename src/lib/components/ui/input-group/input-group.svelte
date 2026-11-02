<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...props
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="input-group"
	role="group"
	class={cn(
		"group/input-group relative flex h-(--size-control-sm) w-full min-w-0 items-center rounded-sm border border-border-strong bg-canvas outline-none transition-colors",
		"focus-within:border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
		"has-disabled:bg-surface-2 has-disabled:opacity-50",
		"has-[[data-slot][aria-invalid=true]]:border-error",
		"has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto",
		"has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
		className
	)}
	{...props}
>
	{@render children?.()}
</div>
