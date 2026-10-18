<script lang="ts">
	import IssueRow from './IssueRow.svelte';
	import * as Empty from '#lib/components/ui/empty';
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
	<Empty.Root class="flex-1 border-0">
		<Empty.Description>{empty}</Empty.Description>
	</Empty.Root>
{:else}
	<div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2" role="list">
		{#each issues as issue (`${issue.repoId}:${issue.number}`)}
			<IssueRow {issue} selected={isSelected(issue)} />
		{/each}
	</div>
{/if}
