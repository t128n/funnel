<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { canonicalLabel } from '#lib/labels';
	import { relativeTime } from '#lib/time';
	import type { IssueListItem } from '#lib/server/issues/types';

	interface Props {
		issue: IssueListItem;
		selected?: boolean;
	}

	let { issue, selected = false }: Props = $props();

	const closed = $derived(issue.state === 'closed');
	const stateColor = $derived(closed ? 'var(--color-accent-purple)' : 'var(--color-accent-green)');
	const statusColor = $derived(
		issue.status ? (canonicalLabel(issue.status)?.color ?? null) : null
	);
	const priorityColor = $derived(
		issue.priority ? (canonicalLabel(issue.priority)?.color ?? null) : null
	);
	const sizeColor = $derived(
		issue.size ? (canonicalLabel(issue.size)?.color ?? null) : null
	);

	function select() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<div
	class="row"
	class:row--selected={selected}
	class:row--closed={closed}
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
		<span class="dot" style="background:{stateColor}" title={closed ? 'Closed' : 'Open'}></span>
		<span class="number mono">#{issue.number}</span>
		<span class="title" title={issue.title}>{issue.title}</span>
		{#if issue.labelConflict}
			<span class="conflict" title="Conflicting reserved labels on GitHub">⚠</span>
		{/if}
		<span class="time" title={new Date(issue.updatedAt).toLocaleString()}>
			{relativeTime(issue.updatedAt)}
		</span>
	</div>
	<div class="row__meta">
		<span class="repo mono">{issue.repo}</span>
		{#if issue.status || issue.priority || issue.size}
			<div class="chips">
				{#if issue.status}
					<Chip label={issue.status} color={statusColor} />
				{/if}
				{#if issue.priority}
					<Chip label={issue.priority.toUpperCase()} color={priorityColor} mono />
				{/if}
				{#if issue.size}
					<Chip label={issue.size} color={sizeColor} variant="outline" mono />
				{/if}
			</div>
		{/if}
		{#if issue.assignees.length > 0}
			<div class="assignees">
				{#each issue.assignees.slice(0, 3) as person (person.githubId)}
					<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.row {
		display: flex;
		flex-direction: column;
		gap: 3px;
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
		background: var(--color-row-active);
	}

	.row__top {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-width: 0;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: var(--radius-full);
		flex: none;
	}

	.number {
		color: var(--color-text-muted);
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

	.row--closed .title {
		color: var(--color-text-muted);
	}

	.conflict {
		color: var(--color-accent-amber);
		flex: none;
	}

	.time {
		flex: none;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.row__meta {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding-left: calc(7px + var(--space-sm));
		min-width: 0;
	}

	.repo {
		flex: 1;
		min-width: 0;
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chips {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex: none;
	}

	.assignees {
		display: flex;
		align-items: center;
		gap: 2px;
		flex: none;
		margin-left: auto;
	}
</style>
