<script lang="ts">
	import { Label } from "#lib/components/primitives/label/index.js";
	import { labelText } from "#lib/components/primitives/styles.js";
	import { cn } from "#lib/utils.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: ComponentProps<typeof Label> = $props();
</script>

<Label
	bind:ref
	data-slot="field-label"
	class={cn(
		labelText,
		"group/field-label peer/field-label flex w-fit items-center gap-1.5 leading-snug select-none",
		"group-data-[disabled=true]/field:pointer-events-none group-data-[disabled=true]/field:opacity-50",
		"has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-xs has-[>[data-slot=field]]:border has-[>[data-slot=field]]:border-border has-[>[data-slot=field]]:p-2",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</Label>
