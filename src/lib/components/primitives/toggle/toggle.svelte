<script lang="ts" module>
	import { focusRing } from "#lib/components/primitives/styles.js";
	import { cn, type ClassValue } from "#lib/utils.js";

	export type ToggleVariant = "outline";
	export type ToggleSize = "default" | "sm";

	/** Flat segmented-control surface; `outline` is the only variant we keep. */
	const toggleSurface: Record<ToggleVariant, string> = {
		outline: "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
	};

	/**
	 * One flat toggle box: 1px `--input` edge, 2px radius, `--accent` when on.
	 * The group strips the radius and edges so a set of items reads as one control.
	 */
	export function toggleClass(
		variant: ToggleVariant = "outline",
		size: ToggleSize = "default",
		className?: ClassValue
	): string {
		return cn(
			"inline-flex shrink-0 items-center justify-center gap-1 rounded-xs border px-2 text-sm transition-colors select-none data-[state=on]:bg-accent data-[state=on]:text-accent-foreground disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
			focusRing,
			toggleSurface[variant],
			size === "sm" ? "h-6 min-w-6 px-1.5 text-xs" : "h-7 min-w-7",
			className
		);
	}
</script>

<script lang="ts">
	import { Toggle as TogglePrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		pressed = $bindable(false),
		class: className,
		size = "default",
		variant = "outline",
		...restProps
	}: TogglePrimitive.RootProps & {
		variant?: ToggleVariant;
		size?: ToggleSize;
	} = $props();
</script>

<TogglePrimitive.Root
	bind:ref
	bind:pressed
	data-slot="toggle"
	data-variant={variant}
	data-size={size}
	class={toggleClass(variant, size, className)}
	{...restProps}
/>
