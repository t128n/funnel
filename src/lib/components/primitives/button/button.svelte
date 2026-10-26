<script lang="ts" module>
	import { cn, type WithElementRef } from "#lib/utils.js";
	import { focusRing } from "../styles.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	const buttonSurface = {
		default: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
		outline: "border-border bg-muted text-foreground hover:bg-accent aria-expanded:bg-accent",
		secondary:
			"border-border bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
		ghost:
			"border-transparent bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
		destructive: "border-destructive bg-destructive text-background hover:bg-destructive/90",
	} as const;

	const buttonSize = {
		default: "h-7 px-2.5",
		sm: "h-6 gap-1 px-2 text-xs",
		xs: "h-5 gap-1 px-1.5 text-xs",
		lg: "h-8 px-3",
		icon: "size-7",
		"icon-sm": "size-6",
		"icon-xs": "size-5",
	} as const;

	export type ButtonVariant = keyof typeof buttonSurface;
	export type ButtonSize = keyof typeof buttonSize;

	/**
	 * Native-looking chrome: 1px edge, 2px radius, flat token fills.
	 *
	 * `default` is the one `--primary` fill; `outline`, `secondary` and `ghost`
	 * stay on `--muted`/`--accent` so a view keeps a single accent.
	 */
	export function buttonVariants({
		variant = "default",
		size = "default",
	}: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
		return cn(
			"inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xs border text-sm font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
			focusRing,
			buttonSurface[variant],
			buttonSize[size]
		);
	}

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
