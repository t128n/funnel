<script lang="ts" module>
	import { cn } from "#lib/utils.js";

	export type SidebarMenuButtonVariant = "default" | "outline";
	export type SidebarMenuButtonSize = "default" | "sm" | "lg";

	/**
	 * One flat row in every variant. The 3px rule is painted on the
	 * pseudo-element so it is a real edge, not a shadow, and it sits flush
	 * against the row. The base carries no border: a transparent one would
	 * eat 2px of the 32px icon target and clip the 16px glyph.
	 */
	const menuButtonBase =
		"peer/menu-button group/menu-button relative flex w-full items-center gap-2 overflow-hidden rounded-none p-2 text-left text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--sidebar-ring)] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 before:absolute before:inset-y-0 before:start-0 before:w-[3px] before:bg-transparent data-[active=true]:bg-transparent data-[active=true]:font-semibold data-[active=true]:text-[var(--sidebar-primary)] data-[active=true]:before:bg-[var(--sidebar-primary)] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2! [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate";

	const menuButtonVariants: Record<SidebarMenuButtonVariant, string> = {
		default: "",
		outline:
			"border border-sidebar-border bg-background hover:border-sidebar-accent group-data-[collapsible=icon]:border-0",
	};

	export const sidebarMenuButtonSizes: Record<SidebarMenuButtonSize, string> = {
		default: "h-8 text-sm",
		sm: "h-7 text-xs",
		lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
	};

	/** Compose the row from the variant map; no runtime variant package. */
	export function sidebarMenuButtonVariants({
		variant = "default",
		size = "default",
	}: {
		variant?: SidebarMenuButtonVariant;
		size?: SidebarMenuButtonSize;
	} = {}): string {
		return cn(menuButtonBase, menuButtonVariants[variant], sidebarMenuButtonSizes[size]);
	}
</script>

<script lang="ts">
	import { mergeProps } from "bits-ui";
	import * as Tooltip from "#lib/components/primitives/tooltip/index.js";
	import type { WithElementRef, WithoutChildrenOrChild } from "#lib/utils.js";
	import { useSidebar } from "./context.svelte.js";
	import type { ComponentProps, Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		child,
		variant = "default",
		size = "default",
		isActive = false,
		tooltipContent,
		tooltipContentProps,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
		isActive?: boolean;
		variant?: SidebarMenuButtonVariant;
		size?: SidebarMenuButtonSize;
		tooltipContent?: Snippet | string;
		tooltipContentProps?: WithoutChildrenOrChild<ComponentProps<typeof Tooltip.Content>>;
		child?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	const sidebar = useSidebar();

	const buttonProps = $derived({
		class: cn(sidebarMenuButtonVariants({ variant, size }), className),
		"data-slot": "sidebar-menu-button",
		"data-sidebar": "menu-button",
		"data-size": size,
		"data-active": isActive,
		...restProps,
	});
</script>

{#snippet Button({ props }: { props?: Record<string, unknown> })}
	{@const mergedProps = mergeProps(buttonProps, props)}
	{#if child}
		{@render child({ props: mergedProps })}
	{:else}
		<button bind:this={ref} {...mergedProps}>
			{@render children?.()}
		</button>
	{/if}
{/snippet}

{#if !tooltipContent}
	{@render Button({})}
{:else}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render Button({ props })}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content
			side="right"
			align="center"
			hidden={sidebar.state !== "collapsed" || sidebar.isMobile}
			{...tooltipContentProps}
		>
			{#if typeof tooltipContent === "string"}
				{tooltipContent}
			{:else if tooltipContent}
				{@render tooltipContent()}
			{/if}
		</Tooltip.Content>
	</Tooltip.Root>
{/if}
