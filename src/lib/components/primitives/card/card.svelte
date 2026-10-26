<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import { panel } from "../styles.js";
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
		panel,
		"group/card flex flex-col gap-3 overflow-hidden bg-card p-3 text-sm text-card-foreground shadow-none",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
