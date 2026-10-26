<script lang="ts" module>
	import { control } from "../styles.js";

	export type NativeSelectSize = "sm" | "default";
</script>

<script lang="ts">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLSelectAttributes } from "svelte/elements";

	type NativeSelectProps = Omit<WithElementRef<HTMLSelectAttributes>, "size"> & {
		size?: NativeSelectSize;
	};

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		size = "default",
		children,
		...restProps
	}: NativeSelectProps = $props();

	const compact = $derived(size === "sm");
</script>

<div
	class={cn("group/native-select relative w-fit has-[select:disabled]:opacity-60", className)}
	data-slot="native-select-wrapper"
	data-size={size}
>
	<select
		bind:value
		bind:this={ref}
		data-slot="native-select"
		data-size={size}
		class={cn(control, "appearance-none pr-7", compact && "h-6 pr-6 text-xs")}
		{...restProps}
	>
		{@render children?.()}
	</select>
	<ChevronDownIcon
		class={cn(
			"pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground",
			compact && "right-1.5 size-3.5"
		)}
		aria-hidden
		data-slot="native-select-icon"
	/>
</div>
