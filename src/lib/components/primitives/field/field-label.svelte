<script lang="ts" module>
	import { labelText } from "#lib/components/primitives/styles.js";
	import { cn } from "#lib/utils.js";

	export type FieldLabelVariant = "default" | "choice";

	/**
	 * `default` is the small caps prompt above a control. `choice` is a
	 * selectable card around a radio or checkbox: it keeps body size and
	 * normal weight, draws its own 1px edge, and takes the accent when its
	 * control is checked.
	 */
	const labelSurface: Record<FieldLabelVariant, string> = {
		default: cn(
			labelText,
			"has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-xs has-[>[data-slot=field]]:border has-[>[data-slot=field]]:border-border has-[>[data-slot=field]]:p-2"
		),
		choice: cn(
			"cursor-pointer rounded-xs border border-input bg-transparent px-2 py-1 text-sm font-normal text-foreground",
			"has-[:checked]:border-primary has-[:checked]:bg-accent",
			"has-data-checked:border-primary has-data-checked:bg-accent",
			"data-[state=checked]:border-primary data-[state=checked]:bg-accent",
			"has-[:focus-visible]:border-primary"
		)
	};
</script>

<script lang="ts">
	import { Label } from "#lib/components/primitives/label/index.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		children,
		...restProps
	}: ComponentProps<typeof Label> & {
		variant?: FieldLabelVariant;
	} = $props();
</script>

<Label
	bind:ref
	data-slot="field-label"
	data-variant={variant}
	class={cn(
		"group/field-label peer/field-label flex w-fit items-center gap-1.5 leading-snug select-none",
		"group-data-[disabled=true]/field:pointer-events-none group-data-[disabled=true]/field:opacity-50",
		labelSurface[variant],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</Label>
