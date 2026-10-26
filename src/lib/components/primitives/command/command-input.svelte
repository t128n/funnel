<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import SearchIcon from "@lucide/svelte/icons/search";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(""),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<div data-slot="command-input-wrapper" class="flex h-8 items-center gap-1.5 border-b border-border px-2">
	<SearchIcon class="size-3.5 shrink-0 text-muted-foreground" />
	<CommandPrimitive.Input
		{value}
		data-slot="command-input"
		class={cn(
			"h-7 w-full min-w-0 border-0 bg-transparent py-0 text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		{...restProps}
	/>
</div>
