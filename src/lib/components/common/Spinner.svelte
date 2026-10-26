<script lang="ts">
	import { Spinner as SpinnerIcon } from '#lib/components/primitives/spinner';

	interface Props {
		/** Diameter in px. */
		size?: number;
		label?: string;
	}

	let { size = 14, label = 'Loading' }: Props = $props();
</script>

<SpinnerIcon class="text-current" style="width:{size}px;height:{size}px" aria-label={label} />
