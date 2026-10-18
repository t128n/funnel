<script lang="ts">
	import IntakeTag from '#lib/components/common/IntakeTag.svelte';
	import { selectSubmission } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import type { StagedSubmission } from '#lib/server/intake/staging';
	import { cn } from '#lib/utils';

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
		'issue-grid group/row cursor-pointer border-b border-[color:var(--surface-divider)] py-1.5 select-none transition-colors duration-[120ms] last:border-b-0',
		'hover:bg-[var(--surface-tag-bg)]',
		'focus-visible:outline-[1.5px] focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--surface-accent)]',
		selected && 'bg-[var(--surface-card-hover)] shadow-[inset_2px_0_0_var(--surface-accent)]'
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
	<span></span>
	<span></span>

	<span class="flex min-w-0 items-center gap-1.5">
		<IntakeTag />
		<span class="flex min-w-0 flex-col">
			<span class="text-foreground truncate text-[13px]" title={title}>{title}</span>
			<span class="mono text-muted-foreground truncate text-[11px]">
				{submission.source ?? 'via intake'}
			</span>
		</span>
	</span>

	<span class="issue-col-labels"></span>
	<span></span>
	<span></span>

	<span
		class="text-muted-foreground justify-self-end truncate text-[11px] tabular-nums"
		title={new Date(submission.createdAt).toLocaleString()}
	>
		{timeAgo(submission.createdAt)}
	</span>

	<span></span>
</div>
