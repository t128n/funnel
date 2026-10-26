<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		child,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		child?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	const mergedProps = $derived({
		class: cn(
			"w-fit max-w-full min-w-0 overflow-hidden rounded-xs border border-border bg-card px-3 py-2 text-sm leading-relaxed text-card-foreground wrap-break-word",
			"group-data-[align=end]/bubble:self-end",
			"[button]:text-left [button,a]:transition-colors [button,a]:outline-none [button,a]:focus-visible:outline-2 [button,a]:focus-visible:outline-offset-1 [button,a]:focus-visible:outline-[var(--ring)]",
			className
		),
		"data-slot": "bubble-content",
		...restProps
	});
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<div bind:this={ref} {...mergedProps}>
		{@render children?.()}
	</div>
{/if}
