<script lang="ts">
	import { selectSubmission } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import type { StagedSubmission } from '#lib/server/intake/staging';
	import { absoluteTime } from '#lib/time';
	import { cn } from '#lib/utils';

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
	class={cn(
		'group/row flex min-h-(--size-row-compact) cursor-pointer select-none items-center gap-3 border-b border-border-subtle px-[var(--layout-page-padding)] text-body last:border-b-0',
		'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
		selected && 'is-selected-row'
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
	<span
		class="mono w-24 min-w-0 shrink-0 truncate text-caption text-fg-secondary"
		title={source}
	>
		{source}
	</span>

	<span class="min-w-0 flex-1 truncate text-body text-fg" title={title}>{title}</span>

	<time
		class="w-20 shrink-0 truncate text-right text-caption text-fg-secondary tabular-nums"
		datetime={new Date(submission.createdAt).toISOString()}
		title={absoluteTime(submission.createdAt)}
	>
		{timeAgo(submission.createdAt)}
	</time>
</div>
