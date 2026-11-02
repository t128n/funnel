<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";
	import type { WithoutChildrenOrChild } from "#lib/utils.js";
	import TooltipPortal from "./tooltip-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 0,
		side = "top",
		children,
		arrowClasses,
		portalProps,
		...restProps
	}: TooltipPrimitive.ContentProps & {
		arrowClasses?: string;
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
	} = $props();
</script>

<TooltipPortal {...portalProps}>
	<TooltipPrimitive.Content
		bind:ref
		data-slot="tooltip-content"
		{sideOffset}
		{side}
		class={cn(
			"z-[var(--z-dropdown)] inline-flex w-fit max-w-xs items-center gap-1.5 rounded-sm bg-fg px-2 py-1 text-caption text-canvas shadow-raised",
			"origin-(--bits-tooltip-content-transform-origin)",
			"data-open:animate-in data-open:fade-in-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0",
			"data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
			"duration-[var(--motion-base)]",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		<TooltipPrimitive.Arrow>
			{#snippet child({ props })}
				<div
					class={cn("z-[var(--z-dropdown)] size-2 rotate-45 rounded-[1px] bg-fg fill-fg", arrowClasses)}
					{...props}
				></div>
			{/snippet}
		</TooltipPrimitive.Arrow>
	</TooltipPrimitive.Content>
</TooltipPortal>
