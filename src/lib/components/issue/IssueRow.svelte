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
	const priorityColor = $derived(
		issue.priority ? (canonicalLabel(issue.priority)?.color ?? null) : null
	);
	const sizeColor = $derived(
		issue.size ? (canonicalLabel(issue.size)?.color ?? null) : null
	);
	const statusColor = $derived(
		issue.status ? (canonicalLabel(issue.status)?.color ?? null) : null
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
	<span
		class="state"
		style="background:{stateColor}"
		title={closed ? 'Closed' : 'Open'}
	></span>

	<span class="repo mono">{issue.repo}</span>
	<span class="number mono">#{issue.number}</span>
	<span class="title" title={issue.title}>{issue.title}</span>

	{#if issue.labelConflict}
		<span class="conflict" title="Conflicting reserved labels on GitHub">⚠</span>
	{/if}

	<div class="meta">
		{#if issue.status}
			<Chip label={issue.status} color={statusColor} />
		{/if}
		{#if issue.priority}
			<Chip label={issue.priority.toUpperCase()} color={priorityColor} mono />
		{/if}
		{#if issue.size}
			<Chip label={issue.size} color={sizeColor} variant="outline" mono />
		{/if}
		<span class="updated" title={new Date(issue.updatedAt).toLocaleString()}>
			{relativeTime(issue.updatedAt)}
		</span>
		<div class="assignees">
			{#each issue.assignees.slice(0, 3) as person (person.githubId)}
				<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
			{/each}
			{#if issue.assignees.length > 3}
				<span class="assignees__more mono">+{issue.assignees.length - 3}</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: var(--row-height);
		padding: 0 var(--space-sm) 0 0;
		border-bottom: 1px solid var(--color-border-subtle);
		cursor: pointer;
		user-select: none;
		outline: none;
		transition: background var(--transition-fast);
	}

	.row:hover,
	.row:focus-visible {
		background: var(--color-surface-layer-1);
	}

	.row--selected {
		background: var(--color-surface-layer-2);
		box-shadow: inset 2px 0 0 var(--color-primary);
	}

	.row--closed .title {
		color: var(--color-text-muted);
	}

	.state {
		width: 3px;
		height: 16px;
		border-radius: var(--radius-full);
		flex: none;
	}

	.repo {
		color: var(--color-text-secondary);
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.conflict {
		color: var(--color-accent-amber);
		flex: none;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex: none;
		color: var(--color-text-muted);
	}

	.updated {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		width: 62px;
		text-align: right;
	}

	.assignees {
		display: flex;
		align-items: center;
		gap: 2px;
		min-width: 16px;
	}

	.assignees__more {
		color: var(--color-text-muted);
		font-size: 10px;
	}
</style>
