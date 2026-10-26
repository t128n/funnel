<script lang="ts" module>
	export type InputGroupAddonAlign = "inline-start" | "inline-end" | "block-start" | "block-end";

	/**
	 * Addon placement inside the shell. `inline-*` sits beside the control,
	 * `block-*` stacks above or below it.
	 */
	const alignClass: Record<InputGroupAddonAlign, string> = {
		"inline-start": "order-first pl-2 has-[>button]:-ml-1 has-[>kbd]:-ml-0.5",
		"inline-end": "order-last pr-2 has-[>button]:-mr-1 has-[>kbd]:-mr-0.5",
		"block-start": "order-first w-full justify-start px-2 pt-2",
		"block-end": "order-last w-full justify-start px-2 pb-2"
	};
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		align = "inline-start",
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		align?: InputGroupAddonAlign;
	} = $props();
</script>

<div
	bind:this={ref}
	role="group"
	data-slot="input-group-addon"
	data-align={align}
	class={cn(
		"flex h-auto cursor-text items-center justify-center gap-1.5 py-1.5 text-sm font-medium text-muted-foreground select-none",
		"group-has-[[data-slot=input-group-control]:disabled]:opacity-60",
		"[&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-xs",
		alignClass[align],
		className
	)}
	onclick={(e) => {
		if ((e.target as HTMLElement).closest("button")) {
			return;
		}
		e.currentTarget.parentElement
			?.querySelector<HTMLElement>("input, textarea")
			?.focus();
	}}
	{...restProps}
>
	{@render children?.()}
</div>
