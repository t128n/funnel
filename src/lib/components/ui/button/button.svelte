<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	export const buttonVariants = tv({
		base: [
			"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent",
			"font-semibold transition-colors outline-hidden select-none",
			"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
			"disabled:pointer-events-none disabled:border-transparent disabled:bg-surface-2 disabled:text-fg-disabled",
			"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
		].join(" "),
		variants: {
			variant: {
				default: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover",
				outline:
					"border-border-strong bg-canvas text-fg hover:bg-surface active:bg-surface-2",
				secondary:
					"border-border-strong bg-canvas text-fg hover:bg-surface active:bg-surface-2",
				ghost: "bg-transparent text-fg hover:bg-surface active:bg-surface-2",
				destructive:
					"bg-error text-on-error hover:bg-error-hover active:bg-error-hover",
				link: "bg-transparent text-primary underline-offset-2 hover:underline"
			},
			size: {
				default: "h-(--size-control-md) gap-2 px-3 text-body",
				xs: "h-(--size-control-sm) gap-1.5 px-2 text-caption",
				sm: "h-(--size-control-md) gap-1.5 px-2.5 text-body",
				lg: "h-(--size-control-lg) gap-2 px-3 text-body",
				icon: "size-(--size-control-md)",
				"icon-xs": "size-(--size-control-sm)",
				"icon-sm": "size-(--size-control-sm)",
				"icon-lg": "size-(--size-control-md)"
			}
		},
		defaultVariants: {
			variant: "default",
			size: "default"
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
