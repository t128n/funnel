<script lang="ts">
	import { cn } from "#lib/utils";

	interface Props {
		source?: string | null;
		class?: string;
	}

	let { source = null, class: className }: Props = $props();
</script>

<span
	class={cn(
		"inline-flex h-(--size-tag-height) shrink-0 items-center rounded-sm bg-surface-2 px-1.5 text-caption font-semibold text-fg-secondary",
		className
	)}
>
	{source ?? "Intake"}
</span>
