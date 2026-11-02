<script lang="ts">
	import { cn } from '#lib/utils';

	/**
	 * A 0.25 rem progress track on `surface-2` with a `primary` fill. The bar is
	 * decorative: the adjacent `3 / 8` text carries the value for screen readers.
	 */
	interface Props {
		/** Completion percentage, clamped to `0..100`. */
		value: number;
		class?: string;
	}

	let { value, class: className }: Props = $props();

	const percent = $derived(Math.min(100, Math.max(0, Math.round(value))));
</script>

<span
	class={cn(
		'inline-flex h-(--size-capacity-bar) w-12 shrink-0 overflow-hidden rounded-full bg-surface-2',
		className
	)}
	aria-hidden="true"
>
	<span class="block h-full bg-primary" style={`width: ${percent}%`}></span>
</span>
