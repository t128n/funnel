<script lang="ts" module>
	import { cn } from "#lib/utils.js";
	import { focusRing } from "../styles.js";

	export type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

	/**
	 * A badge is a token, not a pill: mono 10px uppercase on `--muted`, one 1px
	 * edge, square corners, and the variant colour on the text token only.
	 */
	const badgeSurface: Record<BadgeVariant, string> = {
		default: "border-border bg-muted text-foreground",
		secondary: "border-border bg-background text-muted-foreground",
		outline: "border-border bg-transparent text-foreground",
		destructive: "border-border bg-transparent text-destructive"
	};

	export function badgeVariants({ variant = "default" }: { variant?: BadgeVariant } = {}): string {
		return cn(
			"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-none border px-1.5 font-mono text-2xs font-medium tracking-wide whitespace-nowrap uppercase transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
			focusRing,
			badgeSurface[variant]
		);
	}
</script>

<script lang="ts">
	import { type WithElementRef } from "#lib/utils.js";
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
