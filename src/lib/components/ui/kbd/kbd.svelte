<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<kbd
	bind:this={ref}
	data-slot="kbd"
	class={cn(
		"pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded-sm border border-border-subtle bg-surface-2 px-1 font-sans text-caption font-semibold text-fg-secondary",
		"in-data-[slot=tooltip-content]:border-transparent in-data-[slot=tooltip-content]:bg-canvas/10 in-data-[slot=tooltip-content]:text-canvas",
		"[&_svg:not([class*='size-'])]:size-3",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</kbd>
