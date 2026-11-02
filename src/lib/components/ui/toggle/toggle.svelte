<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const toggleVariants = tv({
		base: [
			"group/toggle inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-sm text-body font-semibold",
			"outline-hidden transition-colors select-none",
			"hover:bg-surface active:bg-surface-2",
			"aria-pressed:bg-surface-2 aria-pressed:text-fg data-[state=on]:bg-surface-2 data-[state=on]:text-fg",
			"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
			"disabled:pointer-events-none disabled:bg-surface-2 disabled:text-fg-disabled",
			"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
		].join(" "),
		variants: {
			variant: {
				default: "bg-transparent",
				outline: "border border-border-strong bg-canvas hover:bg-surface"
			},
			size: {
				default: "h-(--size-control-sm) min-w-(--size-control-sm) px-2",
				sm: "h-(--size-control-sm) min-w-(--size-control-sm) px-2 text-body",
				lg: "h-(--size-control-md) min-w-(--size-control-md) px-3"
			}
		},
		defaultVariants: {
			variant: "default",
			size: "default"
		}
	});

	export type ToggleVariant = VariantProps<typeof toggleVariants>["variant"];
	export type ToggleSize = VariantProps<typeof toggleVariants>["size"];
	export type ToggleVariants = VariantProps<typeof toggleVariants>;
</script>

<script lang="ts">
	import { Toggle as TogglePrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		pressed = $bindable(false),
		class: className,
		size = "default",
		variant = "default",
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
	class={cn(toggleVariants({ variant, size }), className)}
	{...restProps}
/>
