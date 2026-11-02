<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = "default",
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { size?: "default" | "sm" } = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	data-size={size}
	class={cn(
		"group/card flex flex-col gap-3 overflow-hidden rounded-md border border-border-subtle bg-canvas p-4 text-body text-fg",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
