<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import CheckIcon from "@lucide/svelte/icons/check";
	import { cn, type WithoutChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children: childrenProp,
		...restProps
	}: WithoutChild<SelectPrimitive.ItemProps> = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	{label}
	data-slot="select-item"
	class={cn(
		"relative flex min-h-(--size-control-sm) w-full cursor-default select-none items-center gap-2 rounded-sm py-1 pl-2 pr-8 text-body outline-hidden",
		"data-highlighted:bg-surface-2 data-highlighted:text-fg",
		"data-disabled:pointer-events-none data-disabled:text-fg-disabled",
		"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		"*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
		className
	)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
		<span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
			{#if selected}
				<CheckIcon class="pointer-events-none" />
			{/if}
		</span>
		<span class="flex shrink-0 gap-2 whitespace-nowrap">
			{#if childrenProp}
				{@render childrenProp({ selected, highlighted })}
			{:else}
				{label || value}
			{/if}
		</span>
	{/snippet}
</SelectPrimitive.Item>
