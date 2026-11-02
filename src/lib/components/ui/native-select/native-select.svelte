<script lang="ts">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLSelectAttributes } from "svelte/elements";

	type NativeSelectProps = Omit<WithElementRef<HTMLSelectAttributes>, "size"> & {
		size?: "sm" | "default";
	};

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		size = "default",
		children,
		...restProps
	}: NativeSelectProps = $props();
</script>

<div
	class={cn("group/native-select relative w-fit has-[select:disabled]:opacity-50", className)}
	data-slot="native-select-wrapper"
	data-size={size}
>
	<select
		bind:value
		bind:this={ref}
		data-slot="native-select"
		data-size={size}
		class="h-(--size-control-md) w-full min-w-0 select-none appearance-none rounded-sm border border-border-strong bg-canvas py-0 pl-3 pr-8 text-body text-fg outline-hidden transition-colors hover:bg-surface focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-error aria-invalid:outline-error aria-invalid:focus-visible:border-error aria-invalid:focus-visible:outline-error disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-disabled data-[size=sm]:h-(--size-control-sm) data-[size=sm]:pl-2"
		{...restProps}
	>
		{@render children?.()}
	</select>
	<ChevronDownIcon
		class="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 select-none text-fg-muted"
		aria-hidden
		data-slot="native-select-icon"
	/>
</div>
