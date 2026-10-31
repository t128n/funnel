<script lang="ts">
	import { Popover as PopoverPrimitive } from "bits-ui";
	import { panel, focusRing } from "../styles.js";
	import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
	import PopoverPortal from "./popover-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		align = "center",
		portalProps,
		...restProps
	}: PopoverPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>;
	} = $props();
</script>

<PopoverPortal {...portalProps}>
	<PopoverPrimitive.Content
		bind:ref
		data-slot="popover-content"
		{sideOffset}
		{align}
		class={cn(
			panel,
			focusRing,
			"z-50 flex w-72 flex-col gap-2.5 p-2.5 text-sm",
			className
		)}
		{...restProps}
	/>
</PopoverPortal>
