<script lang="ts" module>
	import { cn as merge } from "#lib/utils.js";
	import { control } from "../styles.js";

	export type TextareaVariant = "default" | "ghost";

	const defaultControl = merge(control, "h-auto min-h-16 field-sizing-content py-1");

	/**
	 * Borderless inline editor: the same geometry and focus ring as `control`,
	 * with the edge and fill appearing only on hover and keyboard focus.
	 */
	const ghostControl = merge(
		control,
		"h-auto min-h-16 field-sizing-content border-transparent bg-transparent px-1 py-1 hover:border-border focus-visible:border-input"
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
