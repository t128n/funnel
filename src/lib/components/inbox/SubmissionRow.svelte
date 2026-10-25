<script lang="ts">
	import { selectSubmission } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import type { StagedSubmission } from '#lib/server/intake/staging';
	import { cn } from '#lib/utils';

	/**
	 * One staged intake submission in the Inbox feed. Shares `.issue-grid` with
	 * the mirrored issue rows around it, so the columns stay aligned: mono
	 * source reference, 13px title, muted submitted time. No intake pill or
	 * avatar chip; selection is a flat accent fill.
	 */
	interface Props {
		submission: StagedSubmission;
		selected?: boolean;
	}

	let { submission, selected = false }: Props = $props();

	const title = $derived(submission.title.trim() || 'Untitled');

	function select() {
		selectSubmission(submission.id);
	}
</script>

<div
	class={cn(
		'submission-row issue-grid group/row cursor-pointer border-b border-border px-2 py-1.5 select-none transition-colors duration-[120ms] last:border-b-0',
		'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
		selected && 'is-selected'
	)}
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
	<span aria-hidden="true"></span>

	<span
		class="mono text-muted-foreground min-w-0 truncate text-xs"
		title={submission.source ?? 'via intake'}
	>
		{submission.source ?? 'intake'}
	</span>

	<span class="text-foreground min-w-0 truncate text-sm" title={title}>{title}</span>

	<span class="issue-col-labels"></span>
	<span></span>
	<span></span>

	<span
		class="text-muted-foreground justify-self-end truncate text-xs tabular-nums"
		title={new Date(submission.createdAt).toLocaleString()}
	>
		{timeAgo(submission.createdAt)}
	</span>

	<span></span>
</div>

<style>
	:global(div:nth-child(even) > .submission-row) {
		background: color-mix(in srgb, var(--muted) 45%, transparent);
	}

	.submission-row:hover,
	:global(div:nth-child(even) > .submission-row):hover {
		background: var(--accent);
	}

	.submission-row.is-selected,
	.submission-row.is-selected:hover {
		background: var(--accent);
		box-shadow: none;
	}
</style>
