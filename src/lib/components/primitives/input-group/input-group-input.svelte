<script lang="ts">
	import { Input } from "#lib/components/primitives/input/index.js";
	import { cn } from "#lib/utils.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...props
	}: ComponentProps<typeof Input> = $props();
</script>

<Input
	bind:ref
	variant="ghost"
	data-slot="input-group-control"
	class={cn(
		"h-full flex-1 rounded-none border-transparent px-2 hover:border-transparent focus-visible:border-transparent focus-visible:outline-none",
		className
	)}
	bind:value
	{...props}
/>
