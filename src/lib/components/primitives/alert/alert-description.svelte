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
	data-slot="alert-description"
	class={cn(
		"text-sm text-balance text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-primary",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
