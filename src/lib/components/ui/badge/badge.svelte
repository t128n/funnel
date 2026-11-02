<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const badgeVariants = tv({
		base: "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-sm border border-transparent px-1.5 text-caption font-semibold",
		variants: {
			variant: {
				default: "bg-surface-2 text-fg",
				secondary: "bg-surface text-fg-secondary",
				destructive: "bg-surface-2 text-error",
				outline: "border-border-subtle bg-transparent text-fg-secondary",
				ghost: "bg-transparent text-fg-secondary",
				link: "text-primary underline-offset-2 hover:underline"
			}
		},
		defaultVariants: {
			variant: "default"
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? "a" : "span"}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
