<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();
</script>

<p
	bind:this={ref}
	data-slot="field-description"
	class={cn(
		"text-left text-caption font-normal leading-caption text-fg-muted",
		"group-has-data-horizontal/field:text-balance",
		"[&>a]:text-primary [&>a]:underline [&>a]:underline-offset-2 [&>a:hover]:text-primary-hover",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</p>
