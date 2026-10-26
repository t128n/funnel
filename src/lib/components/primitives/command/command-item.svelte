<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import CheckIcon from "@lucide/svelte/icons/check";
	import { menuItem } from "#lib/components/primitives/styles.js";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ItemProps = $props();
</script>

<!-- `onSelect` and `value` arrive through restProps and stay untouched. -->
<CommandPrimitive.Item
	bind:ref
	data-slot="command-item"
	class={cn(
		menuItem,
		"group/command-item relative gap-2 data-[selected]:bg-accent data-[selected]:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<CheckIcon
		class="ml-auto size-4 opacity-0 group-data-[checked=true]/command-item:opacity-100"
	/>
</CommandPrimitive.Item>
