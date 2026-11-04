<script lang="ts">
	import { prioritySpokenLabel } from '#lib/components/common/priority-text';

	interface Props {
		priority?: string | null;
		/** Render the level name beside the token. */
		showName?: boolean;
		/** Board and matrix emphasis stays semibold by default. */
		weight?: 'normal' | 'semibold';
		class?: string;
	}

	let { priority = null, showName = false, weight = 'semibold', class: className = '' }: Props = $props();

	const weightClass = $derived(weight === 'normal' ? 'fw-normal' : 'fw-semibold');

	const meta = $derived(
		priority === 'P1'
			? { name: 'High', tone: 'text-danger' }
			: priority === 'P2'
				? { name: 'Medium', tone: 'text-body' }
				: priority === 'P3'
					? { name: 'Low', tone: 'text-secondary' }
					: null
	);
</script>

{#if priority && meta}
	<span
		class="d-inline-flex align-items-center gap-1 {weightClass} text-nowrap {meta.tone} {className}"
		title={`${priority} · ${meta.name} priority`}
	>
		<span aria-hidden="true">{priority}</span>
		{#if showName}
			<span aria-hidden="true">{meta.name}</span>
		{/if}
		<span class="visually-hidden">{prioritySpokenLabel(priority, meta.name)}</span>
	</span>
{/if}
