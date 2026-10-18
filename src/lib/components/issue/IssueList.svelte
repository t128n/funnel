<script lang="ts">
	import IssueGroupHeader from './IssueGroupHeader.svelte';
	import IssueListHeader from './IssueListHeader.svelte';
	import IssueRow from './IssueRow.svelte';
	import { buildGroups, type ProjectOption } from './grouping';
	import * as Empty from '#lib/components/ui/empty';
	import { getGroupBy, isGroupCollapsed, toggleGroup } from '#lib/client/list-prefs.svelte';
	import type { IssueListItem } from '#lib/server/issues/types';

	interface Props {
		issues: IssueListItem[];
		/** The detail route's issue, highlighted in the feed. */
		selected?: { repo: string; number: number } | null;
		empty?: string;
		/** `owner/name` → project key from `funnel.config.yaml`. */
		repoShortcodes?: Record<string, string>;
		/** Configured project indicators for group-by-project. */
		projects?: ProjectOption[];
		/** The Backlog view is single-status, so sectioning it would be redundant. */
		groupable?: boolean;
	}

	let {
		issues,
		selected = null,
		empty = 'Nothing here.',
		repoShortcodes = {},
		projects = [],
		groupable = true
	}: Props = $props();

	const requested = $derived(groupable ? getGroupBy() : 'none');
	// A stored `project` preference with no configured projects renders flat.
	const groupBy = $derived(requested === 'project' && projects.length === 0 ? 'none' : requested);
	const groups = $derived(buildGroups(issues, groupBy, repoShortcodes, projects));

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
	<div class="issue-list flex min-h-0 flex-1 flex-col overflow-y-auto">
		<IssueListHeader />
		<div class="flex flex-col px-2 pb-2">
			{#if groupBy === 'none'}
				{#each issues as issue (`${issue.repoId}:${issue.number}`)}
					<IssueRow {issue} {repoShortcodes} selected={isSelected(issue)} />
				{/each}
			{:else}
				{#each groups as group (group.key)}
					{@const sectionKey = `${groupBy}:${group.key}`}
					{@const collapsed = isGroupCollapsed(sectionKey)}
					<section class="flex flex-col">
						<IssueGroupHeader
							label={group.label}
							count={group.issues.length}
							{collapsed}
							ontoggle={() => toggleGroup(sectionKey)}
						/>
						{#if !collapsed}
							{#each group.issues as issue (`${issue.repoId}:${issue.number}`)}
								<IssueRow
									{issue}
									{repoShortcodes}
									selected={isSelected(issue)}
									groupedBy={groupBy}
								/>
							{/each}
						{/if}
					</section>
				{/each}
			{/if}
		</div>
	</div>
{/if}
