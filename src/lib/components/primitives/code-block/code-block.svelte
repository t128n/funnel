<script lang="ts" module>
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	export type CodeBlockVariant = "default" | "destructive";
	export type CodeBlockSize = "default" | "sm";

	const codeBlockSurface: Record<CodeBlockVariant, string> = {
		default: "border-border bg-card text-foreground",
		destructive: "border-destructive/30 text-destructive"
	};

	/**
	 * Flat code surface: 1px edge and the token surface only.
	 *
	 * Returns the whole class set, like the other variant helpers, so a caller
	 * that renders its own block still gets the geometry and type scale.
	 */
	export function codeBlockVariants({
		variant = "default"
	}: { variant?: CodeBlockVariant } = {}): string {
		return cn(
			"group/code-block relative flex w-full min-w-0 flex-col overflow-hidden rounded-xs border text-sm",
			"data-[size=sm]:text-xs",
			codeBlockSurface[variant]
		);
	}
</script>

<script lang="ts">
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
