<script lang="ts" module>
	import { cn as merge } from "#lib/utils.js";
	import { control } from "../styles.js";

	export type InputVariant = "default" | "ghost";

	const defaultControl = merge(
		control,
		"py-0 file:mr-2 file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
	);

	/**
	 * Borderless inline editor: the same geometry and focus ring as `control`,
	 * with the edge and fill appearing only on hover and keyboard focus.
	 */
	const ghostControl = merge(
		control,
		"border-transparent bg-transparent px-1 hover:border-border focus-visible:border-input"
	);
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
