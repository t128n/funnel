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
		"text-body leading-body text-balance text-fg-secondary",
		"[&_p:not(:last-child)]:mb-2 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
