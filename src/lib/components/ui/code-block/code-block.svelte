<script lang="ts" module>
	import { tv, type VariantProps } from "tailwind-variants";

	export const codeBlockVariants = tv({
		base: "rounded-md border border-border-subtle bg-surface text-body group/code-block relative flex w-full min-w-0 flex-col overflow-hidden",
		variants: {
			variant: {
				default: "text-fg",
				destructive: "border-error text-error",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type CodeBlockVariant = VariantProps<typeof codeBlockVariants>["variant"];
	export type CodeBlockSize = "default" | "sm";
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		size = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: CodeBlockVariant;
		size?: CodeBlockSize;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="code-block"
	data-variant={variant}
	data-size={size}
	class={cn(codeBlockVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
