<script lang="ts">
	interface Props {
		priority?: string | null;
		/** Render the level name beside the token. */
		showName?: boolean;
		class?: string;
	}

	let { priority = null, showName = false, class: className = '' }: Props = $props();

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
		class="d-inline-flex align-items-center gap-1 fw-semibold text-nowrap {meta.tone} {className}"
		title={`${priority} · ${meta.name} priority`}
	>
		<span aria-hidden="true">{priority}</span>
		{#if showName}
			<span>{meta.name}</span>
		{/if}
		<span class="visually-hidden">, {meta.name} priority</span>
	</span>
{/if}
