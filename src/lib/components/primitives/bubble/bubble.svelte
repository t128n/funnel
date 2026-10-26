<script lang="ts" module>
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	export type BubbleVariant = "default" | "muted";

	const bubbleSurface: Record<BubbleVariant, string> = {
		default: "",
		muted:
			"*:data-[slot=bubble-content]:bg-muted *:data-[slot=bubble-content]:text-foreground"
	};

	/**
	 * Flat bubble variants: a bordered card box, or the muted counterpart.
	 *
	 * Returns the whole class set, like the other variant helpers, so a caller
	 * that renders its own bubble element still gets the geometry.
	 */
	export function bubbleVariants({
		variant = "default"
	}: { variant?: BubbleVariant } = {}): string {
		return cn(
			"group/bubble relative flex w-fit max-w-[80%] min-w-0 flex-col gap-1",
			"data-[align=end]:self-end group-data-[align=end]/message:self-end",
			bubbleSurface[variant]
		);
	}
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		align = "start",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: BubbleVariant;
		align?: "start" | "end";
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="bubble"
	data-variant={variant}
	data-align={align}
	class={cn(bubbleVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
