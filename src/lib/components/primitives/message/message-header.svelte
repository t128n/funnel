<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="message-header"
	class={cn(
		"flex min-w-0 max-w-full items-center gap-1 px-3 text-xs font-medium text-muted-foreground",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
