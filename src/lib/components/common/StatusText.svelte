<script lang="ts">
	interface Props {
		status?: string | null;
		state?: string | null;
		blocked?: boolean;
		class?: string;
	}

	let { status = null, state = null, blocked = false, class: className = '' }: Props = $props();

	const word = $derived(
		blocked
			? 'Blocked'
			: state === 'closed'
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
										: 'Unconfirmed'
	);

	const tone = $derived(
		blocked
			? 'text-danger'
			: state === 'closed' || status === 'done'
				? 'text-success'
				: status === 'in-progress' || status === 'in-review'
					? 'text-warning-emphasis'
					: 'text-body-secondary'
	);

	const icon = $derived(
		blocked
			? 'bi-slash-circle'
			: state === 'closed' || status === 'done'
				? 'bi-check-circle'
				: status === 'in-progress'
					? 'bi-circle-half'
					: status === 'in-review'
						? 'bi-eye'
						: status === 'backlog'
							? 'bi-circle-dashed'
							: 'bi-circle'
	);
</script>

<span class="d-inline-flex align-items-center gap-1 text-nowrap {tone} {className}">
	<i class="bi {icon}" aria-hidden="true"></i>
	<span>{word}</span>
</span>
