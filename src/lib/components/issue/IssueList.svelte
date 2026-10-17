<script lang="ts">
	import IssueRow from './IssueRow.svelte';
	import { parseSelection, selectedIssue } from '#lib/client/selection.svelte';
	import type { IssueListItem } from '#lib/server/issues/types';

	interface Props {
		issues: IssueListItem[];
		empty?: string;
	}

	let { issues, empty = 'Nothing here.' }: Props = $props();

	const selection = $derived(selectedIssue(parseSelection()));

	function isSelected(issue: IssueListItem): boolean {
		return (
			selection !== null &&
			selection.number === issue.number &&
			selection.repo === issue.repo
		);
	}
</script>

{#if issues.length === 0}
	<div class="empty">{empty}</div>
{:else}
	<div class="list" role="list">
		{#each issues as issue (`${issue.repoId}:${issue.number}`)}
			<IssueRow {issue} selected={isSelected(issue)} />
		{/each}
	</div>
{/if}

<style>
	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-sm);
	}

	.empty {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		padding: var(--space-xl);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}
</style>
