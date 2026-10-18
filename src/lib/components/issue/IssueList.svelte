<script lang="ts">
	import IssueRow from './IssueRow.svelte';
	import * as Empty from '#lib/components/ui/empty';
	import * as Item from '#lib/components/ui/item/index.js';
	import type { IssueListItem } from '#lib/server/issues/types';

	interface Props {
		issues: IssueListItem[];
		/** The detail route's issue, highlighted in the feed. */
		selected?: { repo: string; number: number } | null;
		empty?: string;
	}

	let { issues, selected = null, empty = 'Nothing here.' }: Props = $props();

	function isSelected(issue: IssueListItem): boolean {
		return (
			selected !== null &&
			selected.number === issue.number &&
			selected.repo === issue.repo
		);
	}
</script>

{#if issues.length === 0}
	<Empty.Root class="flex-1 border-0">
		<Empty.Description>{empty}</Empty.Description>
	</Empty.Root>
{:else}
	<Item.Group class="min-h-0 flex-1 gap-0.5 overflow-y-auto p-2">
		{#each issues as issue (`${issue.repoId}:${issue.number}`)}
			<IssueRow {issue} selected={isSelected(issue)} />
		{/each}
	</Item.Group>
{/if}
