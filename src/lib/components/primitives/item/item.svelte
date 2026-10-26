<script lang="ts" module>
	import { cn } from "#lib/utils.js";

	export type ItemSize = "default" | "sm" | "xs";
	export type ItemVariant = "default" | "outline";

	/** Flat list row: square corners, 1px edge only when outlined. */
	const itemSurface: Record<ItemVariant, string> = {
		default: "border-transparent",
		outline: "border-border"
	};

	const itemSpacing: Record<ItemSize, string> = {
		default: "gap-2.5 px-3 py-2",
		sm: "gap-2.5 px-3 py-2",
		xs: "gap-2 px-2.5 py-1.5"
	};

	export function itemVariants({
		variant = "default",
		size = "default"
	}: { variant?: ItemVariant; size?: ItemSize } = {}): string {
		return cn(
			"group/item flex w-full flex-wrap items-center rounded-none border text-sm transition-colors hover:bg-muted",
			itemSurface[variant],
			itemSpacing[size]
		);
	}
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		child,
		variant,
		size,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		child?: Snippet<[{ props: Record<string, unknown> }]>;
		variant?: ItemVariant;
		size?: ItemSize;
	} = $props();

	const mergedProps = $derived({
		class: cn(itemVariants({ variant, size }), className),
		"data-slot": "item",
		"data-variant": variant,
		"data-size": size,
		...restProps,
	});
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<div bind:this={ref} {...mergedProps}>
		{@render mergedProps.children?.()}
	</div>
{/if}
