<script lang="ts" module>
	import { cn } from "#lib/utils.js";

	export type EmptyMediaVariant = "default" | "icon";

	/** The empty state's media well: muted, square-ish, never a pill. */
	const emptyMediaSurface: Record<EmptyMediaVariant, string> = {
		default: "bg-transparent",
		icon: "size-8 rounded-xs bg-muted text-muted-foreground"
	};

	export function emptyMediaVariants({
		variant = "default"
	}: { variant?: EmptyMediaVariant } = {}): string {
		return cn(
			"mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
			emptyMediaSurface[variant]
		);
	}
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		variant = "default",
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { variant?: EmptyMediaVariant } = $props();
</script>

<div
	bind:this={ref}
	data-slot="empty-icon"
	data-variant={variant}
	class={cn(emptyMediaVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
