<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className,
		...restProps
	}: SwitchPrimitive.RootProps = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		"peer group inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-border-strong bg-surface-2 p-0.5 transition-colors",
		"data-[state=checked]:border-primary data-[state=checked]:bg-primary",
		"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
		"disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-2 disabled:opacity-50",
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		class={cn(
			"pointer-events-none block size-3 rounded-full bg-canvas transition-transform",
			"group-data-[state=checked]:translate-x-3"
		)}
	/>
</SwitchPrimitive.Root>
