<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const alertVariants = tv({
		base: "group/alert relative grid w-full gap-1 rounded-sm border px-3 py-2 text-left text-body has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default: "border-border-subtle bg-surface text-fg",
				destructive: "border-error bg-surface text-error *:data-[slot=alert-description]:text-error",
				warning: "border-warning bg-surface text-warning *:data-[slot=alert-description]:text-warning",
				success: "border-success bg-surface text-success *:data-[slot=alert-description]:text-success"
			}
		},
		defaultVariants: {
			variant: "default"
		}
	});

	export type AlertVariant = VariantProps<typeof alertVariants>["variant"];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	role="alert"
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
