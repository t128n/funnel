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
		"group/input-group relative flex h-7 w-full min-w-0 items-center gap-0 rounded-xs border border-input bg-background text-sm text-foreground transition-colors",
		"focus-within:border-ring",
		"has-[[data-slot][aria-invalid=true]]:border-destructive",
		"has-[[data-slot=input-group-control]:disabled]:cursor-not-allowed has-[[data-slot=input-group-control]:disabled]:opacity-60",
		"has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col",
		"has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col",
		"has-[textarea]:h-auto",
		className
	)}
	{...props}
>
	{@render children?.()}
</div>
