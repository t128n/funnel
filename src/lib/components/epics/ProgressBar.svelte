<script lang="ts">
	import { Progress } from '@sveltestrap/sveltestrap';

	/**
	 * A 0.25 rem progress track with a `primary` fill. The bar is decorative: the
	 * adjacent `3 / 8` text carries the value for screen readers.
	 */
	interface Props {
		/** Completion percentage, clamped to `0..100`. */
		value: number;
		class?: string;
	}

	let { value, class: className = '' }: Props = $props();

	const percent = $derived(Math.min(100, Math.max(0, Math.round(value))));
</script>

<Progress
	value={percent}
	color="primary"
	class="flex-shrink-0 {className}"
	style="height: 0.25rem; width: 3rem"
	aria-hidden="true"
/>
