<script lang="ts">
	import { Spinner as BootstrapSpinner } from '@sveltestrap/sveltestrap';

	interface Props {
		size?: number;
		label?: string;
		class?: string;
	}

	let { size = 14, label = 'Loading', class: className = '' }: Props = $props();
</script>

<BootstrapSpinner size={size <= 14 ? 'sm' : ''} class={className}>{label}</BootstrapSpinner>
