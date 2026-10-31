<script lang="ts">
	import { Button } from "#lib/components/primitives/button/index.js";
	import { cn, type WithElementRef } from "#lib/utils.js";
	import * as Dialog from "./index.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		showCloseButton = false,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		showCloseButton?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-footer"
	class={cn("-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-lg border-t border-border p-4 sm:flex-row sm:justify-end", className)}
	{...restProps}
>
	{@render children?.()}
	{#if showCloseButton}
		<Dialog.Close>
			{#snippet child({ props })}
				<Button variant="outline" {...props}>Close</Button>
			{/snippet}
		</Dialog.Close>
	{/if}
</div>
