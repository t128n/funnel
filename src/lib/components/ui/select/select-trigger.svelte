<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import { cn, type WithoutChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = "default",
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"flex h-(--size-control-md) w-fit select-none items-center justify-between gap-1.5 whitespace-nowrap rounded-sm border border-border-strong bg-canvas py-0 pl-3 pr-2 text-body text-fg outline-hidden transition-colors data-[size=sm]:h-(--size-control-sm) data-[size=sm]:pl-2",
		"data-placeholder:text-fg-muted hover:bg-surface",
		"focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
		"aria-invalid:border-error aria-invalid:outline-error",
		"disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-disabled",
		"*:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 *:data-[slot=select-value]:line-clamp-1",
		"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon class="pointer-events-none size-4 text-fg-muted" />
</SelectPrimitive.Trigger>
