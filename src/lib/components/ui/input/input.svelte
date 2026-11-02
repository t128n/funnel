<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();

	const inputClass = $derived(
		cn(
			"h-(--size-control-md) w-full min-w-0 rounded-sm border border-border-strong bg-canvas px-3 py-1 text-body text-fg transition-colors",
			"placeholder:text-fg-muted",
			"focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
			"aria-invalid:border-error aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-error aria-invalid:focus-visible:border-error aria-invalid:focus-visible:outline-error",
			"disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-disabled",
			"file:inline-flex file:h-(--size-control-md) file:border-0 file:bg-transparent file:text-body file:font-semibold file:text-fg",
			className
		)
	);
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={inputClass}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={inputClass}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
