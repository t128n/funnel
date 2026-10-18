<script lang="ts">
	import { fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import GroupByControl from '#lib/components/issue/GroupByControl.svelte';
	import IssueGroupHeader from '#lib/components/issue/IssueGroupHeader.svelte';
	import IssueListHeader from '#lib/components/issue/IssueListHeader.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import SubmissionRow from '#lib/components/inbox/SubmissionRow.svelte';
	import IssueRow from '#lib/components/issue/IssueRow.svelte';
	import { buildGroups } from '#lib/components/issue/grouping';
	import * as Alert from '#lib/components/ui/alert';
	import {
		isGroupCollapsed,
		toggleGroup,
		getGroupBy
	} from '#lib/client/list-prefs.svelte';
	import {
		projectInboxEntries,
		reconcileIssues,
		reconcileSubmissions
	} from '#lib/client/optimistic.svelte';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import type { IssueListItem } from '#lib/server/issues/types';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const entries = $derived(projectInboxEntries(data.inbox.entries));
	// The queue mixes staged submissions with untriaged issues; split them so
	// sections stay stable and the issue half can be grouped like other feeds.
	const submissions = $derived(
		entries.filter((entry) => entry.kind === 'submission')
	);
	const issueEntries = $derived(entries.filter((entry) => entry.kind === 'issue'));
	const issues = $derived(issueEntries.map((entry) => entry.issue));
	const requested = $derived(getGroupBy());
	// A stored `project` preference with no configured projects renders flat.
	const groupBy = $derived(
		requested === 'project' && data.projects.length === 0 ? 'none' : requested
	);
	const groups = $derived(buildGroups(issues, groupBy, data.repoShortcodes, data.projects));
	// The open issue and staged submission are route params.
	const selectedIssue = $derived(parseIssueParams(page.params as IssueParams));
	const selectedSubmissionId = $derived(
		(page.params as { id?: string }).id ?? null
	);

	// Drop overlays and submission hides once the authoritative queue reflects
	// them; a stale refresh leaves them in place.
	$effect(() => {
		const issues: IssueListItem[] = [];
		const submissionIds: string[] = [];
		for (const entry of data.inbox.entries) {
			if (entry.kind === 'issue') issues.push(entry.issue);
			else submissionIds.push(entry.submission.id);
		}
		reconcileIssues(issues);
		reconcileSubmissions(submissionIds);
	});

	const formError = $derived(
		page.form && 'message' in (page.form.data ?? {})
			? (page.form.data as { message?: string }).message
			: null
	);

	function isSelectedIssue(repo: string, number: number): boolean {
		return (
			selectedIssue !== null &&
			selectedIssue.number === number &&
			selectedIssue.repo === repo
		);
	}
</script>

<SplitView detailOpen={selectedIssue !== null || selectedSubmissionId !== null}>
	{#snippet feed()}
		<div class="surface-shell bg-[var(--surface-canvas)] flex min-h-0 flex-1 flex-col">
			<header
				class="border-[color:var(--surface-divider)] flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 sm:py-0"
			>
				<h1 class="text-base font-semibold tracking-tight">Inbox</h1>
				<span class="mono text-muted-foreground text-xs">{entries.length}</span>
				<div
					class="order-last w-full min-w-0 sm:order-none sm:mx-auto sm:w-auto sm:max-w-md sm:flex-1 sm:px-2"
				>
					<FeedSearch />
				</div>
				<div class="ml-auto flex shrink-0 items-center gap-1">
					<GroupByControl projects={data.projects} />
					<FilterPopover options={data.options} />
				</div>
			</header>

			{#if formError}
				<div class="p-2">
					<Alert.Root variant="destructive">
						<Alert.Description>{formError}</Alert.Description>
					</Alert.Root>
				</div>
			{/if}

			{#if entries.length === 0}
				<div
					class="text-muted-foreground flex flex-1 items-center justify-center p-8 text-center text-sm"
				>
					Inbox zero. Nothing staged or untriaged.
				</div>
			{:else}
				<div class="issue-list flex min-h-0 flex-1 flex-col overflow-y-auto">
					<IssueListHeader />
					<div class="flex flex-col px-2 pb-2">
						{#if submissions.length > 0}
							{@const submissionSection = 'inbox:submissions'}
							{@const submissionsCollapsed = isGroupCollapsed(submissionSection)}
							<section class="flex flex-col">
								<IssueGroupHeader
									label="Staged"
									count={submissions.length}
									collapsed={submissionsCollapsed}
									ontoggle={() => toggleGroup(submissionSection)}
								/>
								{#if !submissionsCollapsed}
									{#each submissions as entry (entry.submission.id)}
										<div animate:flip={{ duration: 150 }} out:fade={{ duration: 150 }}>
											<SubmissionRow
												submission={entry.submission}
												selected={selectedSubmissionId === entry.submission.id}
											/>
										</div>
									{/each}
								{/if}
							</section>
						{/if}

						{#if groupBy === 'none'}
							{#each issueEntries as entry (`${entry.issue.repoId}:${entry.issue.number}`)}
								<div animate:flip={{ duration: 150 }} out:fade={{ duration: 150 }}>
									<IssueRow
										issue={entry.issue}
										selected={isSelectedIssue(entry.issue.repo, entry.issue.number)}
										repoShortcodes={data.repoShortcodes}
									/>
								</div>
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
											<div animate:flip={{ duration: 150 }} out:fade={{ duration: 150 }}>
												<IssueRow
													{issue}
													selected={isSelectedIssue(issue.repo, issue.number)}
													repoShortcodes={data.repoShortcodes}
													groupedBy={groupBy}
												/>
											</div>
										{/each}
									{/if}
								</section>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>
