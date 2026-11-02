<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card-footer"
	class={cn("flex items-center gap-2 rounded-b-md border-t border-border-subtle bg-transparent px-4 py-3", className)}
	{...restProps}
>
	{@render children?.()}
</div>
