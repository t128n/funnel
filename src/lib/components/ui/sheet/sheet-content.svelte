<script lang="ts" module>
	export type Side = "top" | "right" | "bottom" | "left";
</script>

<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "#lib/components/ui/button/index.js";
	import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
	import SheetOverlay from "./sheet-overlay.svelte";
	import SheetPortal from "./sheet-portal.svelte";
	import type { Snippet } from "svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		side = "right",
		showCloseButton = true,
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
		side?: Side;
		showCloseButton?: boolean;
		children: Snippet;
	} = $props();
</script>

<SheetPortal {...portalProps}>
	<SheetOverlay />
	<SheetPrimitive.Content
		bind:ref
		data-slot="sheet-content"
		data-side={side}
		class={cn(
			"fixed z-[var(--z-dialog)] flex flex-col gap-4 overscroll-contain border-border-subtle bg-canvas bg-clip-padding text-body text-fg shadow-overlay",
			"data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t",
			"data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-[var(--layout-sidebar)] data-[side=left]:border-r",
			"data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-[var(--layout-sidebar)] data-[side=right]:border-l",
			"data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b",
			"transition duration-[var(--motion-overlay)] ease-out",
			"data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-4 data-[side=left]:data-open:slide-in-from-left-4 data-[side=right]:data-open:slide-in-from-right-4 data-[side=top]:data-open:slide-in-from-top-4",
			"data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-4 data-[side=left]:data-closed:slide-out-to-left-4 data-[side=right]:data-closed:slide-out-to-right-4 data-[side=top]:data-closed:slide-out-to-top-4",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<SheetPrimitive.Close data-slot="sheet-close">
				{#snippet child({ props })}
					<Button variant="ghost" class="absolute right-3 top-3" size="icon-sm" {...props}>
						<XIcon />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</SheetPrimitive.Close>
		{/if}
	</SheetPrimitive.Content>
</SheetPortal>
