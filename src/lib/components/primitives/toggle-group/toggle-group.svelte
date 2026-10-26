<script lang="ts" module>
	import { getContext, setContext } from "svelte";
	import type { ToggleSize, ToggleVariant } from "#lib/components/primitives/toggle/index.js";

	export interface ToggleGroupContext {
		readonly variant: ToggleVariant;
		readonly size: ToggleSize;
		readonly orientation: "horizontal" | "vertical";
	}

	export function setToggleGroupCtx(props: ToggleGroupContext) {
		setContext("toggleGroup", props);
	}

	export function getToggleGroupCtx() {
		return getContext<ToggleGroupContext>("toggleGroup");
	}
</script>

<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		size = "default",
		orientation = "horizontal",
		variant = "outline",
		...restProps
	}: ToggleGroupPrimitive.RootProps & {
		variant?: ToggleVariant;
		size?: ToggleSize;
		orientation?: "horizontal" | "vertical";
	} = $props();

	setToggleGroupCtx({
		get variant() {
			return variant;
		},
		get size() {
			return size;
		},
		get orientation() {
			return orientation;
		}
	});
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<ToggleGroupPrimitive.Root
	bind:value={value as never}
	bind:ref
	{orientation}
	data-slot="toggle-group"
	data-variant={variant}
	data-size={size}
	class={cn(
		"group/toggle-group inline-flex w-fit items-center rounded-xs border border-input bg-background data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
		className
	)}
	{...restProps}
/>
