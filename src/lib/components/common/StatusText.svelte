<script lang="ts">
	import BlockedText from './BlockedText.svelte';

	/**
	 * The issue's workflow status: Backlog, Todo, In progress, In review, Open,
	 * Done or Closed. Blocked is an orthogonal flag rendered beside the status
	 * rather than replacing it, and a genuinely absent status reads "No status"
	 * instead of borrowing triage vocabulary.
	 */
	interface Props {
		status?: string | null;
		state?: string | null;
		blocked?: boolean;
		class?: string;
	}

	let { status = null, state = null, blocked = false, class: className = '' }: Props = $props();

	const word = $derived(
		state === 'closed'
			? 'Closed'
			: status === 'open'
				? 'Open'
				: status === 'done'
					? 'Done'
					: status === 'in-progress'
						? 'In progress'
						: status === 'in-review'
							? 'In review'
							: status === 'backlog'
								? 'Backlog'
								: status === 'todo'
									? 'Todo'
									: 'No status'
	);

	const tone = $derived(
		state === 'closed' || status === 'done'
			? 'text-success'
			: status === 'in-progress'
				? 'text-primary'
				: status === 'in-review'
					? 'text-warning'
					: status === 'backlog' || status === 'todo' || status === 'open'
						? 'text-secondary'
						: 'text-body-secondary'
	);

	const icon = $derived(
		state === 'closed' || status === 'done'
			? 'bi-check-circle'
			: status === 'in-progress'
				? 'bi-circle-half'
				: status === 'in-review'
					? 'bi-eye'
					: status === 'backlog' || status === 'todo' || status === 'open'
						? 'bi-circle'
						: 'bi-dash-circle'
	);
</script>

<span class="status-text d-inline-flex flex-wrap align-items-center gap-1 {className}">
	<span class="d-inline-flex align-items-center gap-1 text-nowrap {tone}">
		<i class="bi {icon}" aria-hidden="true"></i>
		<span>{word}</span>
	</span>
	{#if blocked}
		<span class="d-inline-flex align-items-center gap-1 text-nowrap">
			<span class="text-body-tertiary" aria-hidden="true">·</span>
			<BlockedText />
		</span>
	{/if}
</span>
