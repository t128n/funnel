<script lang="ts">
	import { cn } from "#lib/utils";

	interface Props {
		value: string;
		title?: string;
		class?: string;
	}

	let { value, title, class: className }: Props = $props();
</script>

<span class={cn("mono text-fg-secondary", className)} {title}>{value}</span>
