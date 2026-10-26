<script lang="ts" module>
	export type BubbleVariant = "default" | "muted";

	const variantClass: Record<BubbleVariant, string> = {
		default: "",
		muted:
			"*:data-[slot=bubble-content]:bg-muted *:data-[slot=bubble-content]:text-foreground"
	};

	/** Flat bubble variants: a bordered card box, or the muted counterpart. */
	export function bubbleVariants(variant: BubbleVariant = "default"): string {
		return variantClass[variant];
	}
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

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
	class={cn(
		"group/bubble relative flex w-fit max-w-[80%] min-w-0 flex-col gap-1",
		"data-[align=end]:self-end group-data-[align=end]/message:self-end",
		variantClass[variant],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
