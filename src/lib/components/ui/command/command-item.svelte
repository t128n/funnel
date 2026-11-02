<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import CheckIcon from "@lucide/svelte/icons/check";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ItemProps = $props();
</script>

<CommandPrimitive.Item
	bind:ref
	data-slot="command-item"
	class={cn(
		"group/command-item relative flex min-h-(--size-control-sm) cursor-default select-none items-center gap-2 rounded-sm px-2 py-1 text-body outline-hidden",
		"data-selected:bg-surface-2 data-selected:text-fg",
		"data-disabled:pointer-events-none data-disabled:text-fg-disabled",
		"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<CheckIcon class="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
</CommandPrimitive.Item>
