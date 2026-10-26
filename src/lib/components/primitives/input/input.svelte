<script lang="ts" module>
	import { control, focusRing } from "../styles.js";

	export type InputVariant = "default" | "ghost";

	/** Borderless inline editor: the edge appears on hover and keyboard focus. */
	const ghostControl = [
		"h-7 w-full min-w-0 rounded-xs border border-transparent bg-transparent px-1 text-sm text-foreground transition-colors",
		"placeholder:text-muted-foreground hover:border-border focus-visible:border-input",
		"disabled:cursor-not-allowed disabled:opacity-60",
		focusRing,
	].join(" ");

	const defaultControl = `${control} py-0 file:mr-2 file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground`;
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	> & { variant?: InputVariant };

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		variant = "default",
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();

	const classes = $derived(
		cn(variant === "ghost" ? ghostControl : defaultControl, className)
	);
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={classes}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={classes}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
