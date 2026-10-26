<script lang="ts" module>
	import { cn as merge } from "#lib/utils.js";
	import { control, focusRing } from "../styles.js";

	export type TextareaVariant = "default" | "ghost";

	const defaultControl = merge(control, "h-auto min-h-16 field-sizing-content py-1");

	/** Borderless inline editor: the edge appears on hover and keyboard focus. */
	const ghostControl = merge(
		"h-auto min-h-16 w-full field-sizing-content rounded-xs border border-transparent bg-transparent px-1 py-1 text-sm text-foreground transition-colors placeholder:text-muted-foreground hover:border-border focus-visible:border-input disabled:cursor-not-allowed disabled:opacity-60",
		focusRing
	);

	export const textareaClass = (variant: TextareaVariant) =>
		variant === "ghost" ? ghostControl : defaultControl;
</script>

<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		value = $bindable(),
		variant = "default",
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> & {
		variant?: TextareaVariant;
	} = $props();

	const classes = $derived(cn(textareaClass(variant), className));
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={classes}
	bind:value
	{...restProps}></textarea>
