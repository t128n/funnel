<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'error' | 'warning' | 'success' | 'info';
		message: string;
		action?: Snippet;
		class?: string;
	}

	let { tone = 'info', message, action, class: className = '' }: Props = $props();

	const toneClass = $derived(
		tone === 'error'
			? 'text-danger'
			: tone === 'warning'
				? 'text-warning-emphasis'
				: tone === 'success'
					? 'text-success'
					: 'text-body-secondary'
	);

	const icon = $derived(
		tone === 'error'
			? 'bi-exclamation-circle'
			: tone === 'warning'
				? 'bi-exclamation-triangle'
				: tone === 'success'
					? 'bi-check-circle'
					: 'bi-info-circle'
	);
</script>

<div
	class="d-flex min-w-0 align-items-start gap-2 {toneClass} {className}"
	role={tone === 'error' ? 'alert' : 'status'}
>
	<i class="bi {icon} mt-1 flex-shrink-0" aria-hidden="true"></i>
	<span class="min-w-0 flex-grow-1">{message}</span>
	{#if action}
		<div class="flex-shrink-0">{@render action()}</div>
	{/if}
</div>
