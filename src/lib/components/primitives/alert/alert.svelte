<script lang="ts" module>
	import { cn } from "#lib/utils.js";

	export type AlertVariant = "default" | "destructive";

	/**
	 * Inline notice. `destructive` keeps the flat card surface and moves the
	 * error colour onto the token: a 2px left rule plus destructive text.
	 */
	const alertSurface: Record<AlertVariant, string> = {
		default: "border-border bg-card text-card-foreground",
		destructive:
			"border-border border-l-2 border-l-destructive bg-card text-destructive *:data-[slot=alert-description]:text-destructive"
	};

	export function alertVariants({ variant = "default" }: { variant?: AlertVariant } = {}): string {
		return cn(
			"group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:size-4 *:[svg]:translate-y-0.5 *:[svg]:text-current",
			alertSurface[variant]
		);
	}
</script>

<script lang="ts">
	import { type WithElementRef } from "#lib/utils.js";
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
