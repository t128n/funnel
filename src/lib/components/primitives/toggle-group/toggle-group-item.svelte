<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
	import { toggleClass } from "#lib/components/primitives/toggle/index.js";
	import { cn } from "#lib/utils.js";
	import { getToggleGroupCtx } from "./toggle-group.svelte";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: ToggleGroupPrimitive.ItemProps = $props();

	const ctx = getToggleGroupCtx();
</script>

<ToggleGroupPrimitive.Item
	bind:ref
	data-slot="toggle-group-item"
	data-variant={ctx.variant}
	data-size={ctx.size}
	class={toggleClass(
		ctx.variant,
		ctx.size,
		cn(
			"rounded-none border-0 border-l border-border px-2 first:border-l-0 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground group-data-[orientation=vertical]/toggle-group:border-l-0 group-data-[orientation=vertical]/toggle-group:border-t group-data-[orientation=vertical]/toggle-group:first:border-t-0",
			className
		)
	)}
	{value}
	{...restProps}
/>
