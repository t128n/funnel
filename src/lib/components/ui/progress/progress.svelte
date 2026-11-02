<script lang="ts">
	import { Progress as ProgressPrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value = 0,
		max = 100,
		min = 0,
		...restProps
	}: ProgressPrimitive.RootProps = $props();

	const percent = $derived(
		value === null || max <= min
			? 0
			: Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
	);
</script>

<ProgressPrimitive.Root
	bind:ref
	{value}
	{max}
	{min}
	data-slot="progress"
	class={cn("h-(--size-capacity-bar) w-full overflow-hidden rounded-full bg-surface-2", className)}
	{...restProps}
>
	<div
		class="h-full rounded-full bg-primary transition-[width] duration-[var(--motion-base)]"
		style={`width: ${percent}%`}
	></div>
</ProgressPrimitive.Root>
