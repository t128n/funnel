<script lang="ts">
	import { selectSubmission } from '#lib/client/selection.svelte';
	import { relativeTime } from '#lib/time';
	import type { StagedSubmission } from '#lib/server/intake/staging';

	interface Props {
		submission: StagedSubmission;
		selected?: boolean;
	}

	let { submission, selected = false }: Props = $props();

	function select() {
		selectSubmission(submission.id);
	}
</script>

<div
	class="row"
	class:row--selected={selected}
	role="button"
	tabindex="0"
	aria-current={selected ? 'true' : undefined}
	onclick={select}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select();
		}
	}}
>
	<div class="row__top">
		<span class="badge">intake</span>
		<span class="title" title={submission.title}>{submission.title}</span>
		<span class="time" title={new Date(submission.createdAt).toLocaleString()}>
			{relativeTime(submission.createdAt)}
		</span>
	</div>
	<div class="row__sub mono">{submission.source ?? 'via intake'}</div>
</div>

<style>
	.row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-sm);
		border-radius: var(--radius-sm);
		cursor: pointer;
		user-select: none;
		outline: none;
		transition: background var(--transition-fast);
	}

	.row:hover,
	.row:focus-visible {
		background: var(--color-row-hover);
	}

	.row--selected {
		background: color-mix(in srgb, var(--color-accent-cyan) 12%, var(--color-row-active));
	}

	.row__top {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-width: 0;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		height: 16px;
		padding: 0 var(--space-xs);
		border-radius: var(--radius-xs);
		background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
		color: var(--color-accent-cyan);
		font-size: 10px;
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex: none;
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-base);
		color: var(--color-text-primary);
	}

	.time {
		flex: none;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.row__sub {
		padding-left: 2px;
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
