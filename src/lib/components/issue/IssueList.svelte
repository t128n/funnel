<script lang="ts">
	import IssueRow from './IssueRow.svelte';
	import { parseSelection } from '#lib/client/selection.svelte';
	import type { IssueListItem } from '#lib/server/issues/types';

	interface Props {
		issues: IssueListItem[];
		empty?: string;
	}

	let { issues, empty = 'Nothing here.' }: Props = $props();

	const selection = $derived(parseSelection());

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
		overflow-y: auto;
	}

	.empty {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}
</style>
