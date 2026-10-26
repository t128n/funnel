<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import { triggerChevron, triggerClass } from "#lib/components/primitives/styles.js";
	import { cn, type WithoutChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		variant = "default",
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		variant?: "default" | "ghost" | "pill";
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-variant={variant}
	class={triggerClass(
		variant,
		cn(
			"w-fit whitespace-nowrap",
			"*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5",
			className
		)
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon class={triggerChevron} />
</SelectPrimitive.Trigger>
