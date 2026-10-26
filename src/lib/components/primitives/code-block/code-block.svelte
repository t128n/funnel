<script lang="ts" module>
	export type CodeBlockVariant = "default" | "destructive";
	export type CodeBlockSize = "default" | "sm";

	const variantClass: Record<CodeBlockVariant, string> = {
		default: "border-border bg-card text-foreground",
		destructive: "border-destructive/30 text-destructive"
	};

	/** Flat code surface: 1px edge and the token surface only. */
	export function codeBlockVariants(variant: CodeBlockVariant = "default"): string {
		return variantClass[variant];
	}
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
	class={cn(
		"group/code-block relative flex w-full min-w-0 flex-col overflow-hidden rounded-xs border text-sm",
		"data-[size=sm]:text-xs",
		variantClass[variant],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
