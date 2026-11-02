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
	data-slot="empty-description"
	class={cn(
		"max-w-[var(--layout-form-max)] text-body leading-body text-fg-secondary",
		"[&>a]:text-primary [&>a]:underline [&>a]:underline-offset-2",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
