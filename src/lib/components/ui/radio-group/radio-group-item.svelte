<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from "bits-ui";
	import CircleIcon from "@lucide/svelte/icons/circle";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: RadioGroupPrimitive.ItemProps = $props();
</script>

<RadioGroupPrimitive.Item
	bind:ref
	data-slot="radio-group-item"
	class={cn(
		"group/radio flex min-h-(--size-control-sm) w-full items-center gap-2 rounded-sm border border-border-subtle bg-canvas px-3 py-2 text-left text-body text-fg",
		"hover:bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-surface-3",
		"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
		"disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-disabled",
		className
	)}
	{...restProps}
>
	<span
		class="flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong text-transparent group-data-[state=checked]/radio:border-primary group-data-[state=checked]/radio:text-primary"
		aria-hidden="true"
	>
		<CircleIcon class="size-2 fill-current" />
	</span>
	<span class="min-w-0 flex-1">{@render children?.()}</span>
</RadioGroupPrimitive.Item>
