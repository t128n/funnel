<script lang="ts">
	import { Textarea } from "#lib/components/primitives/textarea/index.js";
	import { cn } from "#lib/utils.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...props
	}: ComponentProps<typeof Textarea> = $props();
</script>

<Textarea
	bind:ref
	variant="ghost"
	data-slot="input-group-control"
	class={cn(
		"min-h-16 flex-1 resize-none rounded-none border-transparent px-2 py-2 hover:border-transparent focus-visible:border-transparent focus-visible:outline-none",
		className
	)}
	bind:value
	{...props}
/>
