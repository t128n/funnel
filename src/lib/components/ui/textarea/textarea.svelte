<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		"flex min-h-24 w-full resize-y rounded-sm border border-border-strong bg-canvas px-3 py-2 text-body text-fg transition-colors",
		"field-sizing-content placeholder:text-fg-muted",
		"focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
		"aria-invalid:border-error aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-error aria-invalid:focus-visible:border-error aria-invalid:focus-visible:outline-error",
		"disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-disabled",
		className
	)}
	bind:value
	{...restProps}></textarea>
