<script lang="ts" module>
	import { tv, type VariantProps } from "tailwind-variants";
	export const inputGroupAddonVariants = tv({
		base: "flex h-auto cursor-text select-none items-center justify-center gap-2 py-1 text-body font-normal text-fg-muted group-data-[disabled=true]/input-group:opacity-50 [&>svg:not([class*='size-'])]:size-4",
		variants: {
			align: {
				"inline-start": "order-first pl-2 [&>button]:ml-[-0.3rem] [&>kbd]:ml-[-0.15rem]",
				"inline-end": "order-last pr-2 [&>button]:mr-[-0.3rem] [&>kbd]:mr-[-0.15rem]",
				"block-start":
					"order-first w-full justify-start px-2 pt-2 [.border-b]:pb-2 group-has-[>input]/input-group:pt-2",
				"block-end":
					"order-last w-full justify-start px-2 pb-2 [.border-t]:pt-2 group-has-[>input]/input-group:pb-2"
			}
		},
		defaultVariants: {
			align: "inline-start"
		}
	});

	export type InputGroupAddonAlign = VariantProps<typeof inputGroupAddonVariants>["align"];
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
	class={cn(inputGroupAddonVariants({ align }), className)}
	onclick={(e) => {
		if ((e.target as HTMLElement).closest("button")) {
			return;
		}
		e.currentTarget.parentElement?.querySelector("input")?.focus();
	}}
	{...restProps}
>
	{@render children?.()}
</div>
