<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		inset,
		variant = "default",
		...restProps
	}: DropdownMenuPrimitive.ItemProps & {
		inset?: boolean;
		variant?: "default" | "destructive";
	} = $props();
</script>

<DropdownMenuPrimitive.Item
	bind:ref
	data-slot="dropdown-menu-item"
	data-inset={inset}
	data-variant={variant}
	class={cn(
		"group/dropdown-menu-item relative flex min-h-(--size-control-sm) cursor-default select-none items-center gap-2 rounded-sm px-2 py-1 text-body outline-hidden",
		"focus:bg-surface-2 focus:text-fg data-disabled:pointer-events-none data-disabled:text-fg-disabled",
		"data-[variant=destructive]:text-error data-[variant=destructive]:focus:bg-surface-2 data-[variant=destructive]:focus:text-error",
		"data-inset:pl-8 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
/>
