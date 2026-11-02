<script lang="ts">
	import { Spinner as SpinnerIcon } from '#lib/components/ui/spinner';
	import { cn } from '#lib/utils';

	interface Props {
		size?: number;
		label?: string;
		class?: string;
	}

	let { size = 14, label = 'Loading', class: className }: Props = $props();
</script>

<SpinnerIcon
	class={cn(size <= 14 ? 'size-3.5' : size <= 18 ? 'size-4' : 'size-5', className)}
	aria-label={label}
/>
