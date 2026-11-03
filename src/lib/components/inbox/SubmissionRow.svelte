<script lang="ts">
	import { selectSubmission } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import type { StagedSubmission } from '#lib/server/intake/staging';
	import { absoluteTime } from '#lib/time';

	/**
	 * One staged intake submission in the Inbox's own Submissions section.
	 * Compact, ruled row: source, title, received time. Selection is the shared
	 * 2 px primary leading bar, never a fill; the row is itself the hit target.
	 */
	interface Props {
		submission: StagedSubmission;
		selected?: boolean;
	}

	let { submission, selected = false }: Props = $props();

	const title = $derived(submission.title.trim() || 'Untitled');
	const source = $derived(submission.source?.trim() || 'Intake');

	function select() {
		selectSubmission(submission.id);
	}
</script>

<div
	class="submission-row d-flex align-items-center gap-3 px-3 text-body {selected
		? 'is-selected-row'
		: ''}"
	role="button"
	tabindex={0}
	aria-current={selected ? 'true' : undefined}
	aria-label={`Intake submission: ${title}`}
	onclick={select}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select();
		}
	}}
>
	<span
		class="submission-source min-w-0 flex-shrink-0 text-truncate font-monospace small text-body-secondary"
		title={source}
	>
		{source}
	</span>

	<span class="min-w-0 flex-grow-1 text-truncate small text-body" title={title}>{title}</span>

	<time
		class="submission-received flex-shrink-0 text-truncate text-end small text-body-secondary tabular"
		datetime={new Date(submission.createdAt).toISOString()}
		title={absoluteTime(submission.createdAt)}
	>
		{timeAgo(submission.createdAt)}
	</time>
</div>

<style>
	.submission-row {
		min-height: var(--funnel-row-compact);
		border-bottom: 1px solid var(--bs-border-color);
		cursor: pointer;
		user-select: none;
	}

	.submission-row:last-child {
		border-bottom: 0;
	}

	.submission-row:hover {
		background: var(--bs-tertiary-bg);
	}
	.submission-row:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: -2px;
	}

	.submission-row.is-selected-row {
		box-shadow: inset 2px 0 0 0 var(--bs-primary);
	}

	.submission-source {
		width: 6rem;
	}

	.submission-received {
		width: 5rem;
	}

	.tabular {
		font-variant-numeric: tabular-nums;
	}
</style>
