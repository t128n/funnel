<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import CheckIcon from "@lucide/svelte/icons/check";
	import { menuItem } from "#lib/components/primitives/styles.js";
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
	class={cn(menuItem, "relative pr-8", className)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
		<span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
			{#if selected}
				<CheckIcon class="size-4" />
			{/if}
		</span>
		<span class="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
			{#if childrenProp}
				{@render childrenProp({ selected, highlighted })}
			{:else}
				{label || value}
			{/if}
		</span>
	{/snippet}
</SelectPrimitive.Item>
