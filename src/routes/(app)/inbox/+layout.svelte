<script lang="ts">
	import { fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import SubmissionRow from '#lib/components/inbox/SubmissionRow.svelte';
	import IssueRow from '#lib/components/issue/IssueRow.svelte';
	import * as Alert from '#lib/components/ui/alert';
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
		<header class="flex h-11 shrink-0 items-center gap-2 border-b px-2">
			<h1 class="text-base font-semibold tracking-tight">Inbox</h1>
			<span class="mono text-muted-foreground text-xs">{entries.length}</span>
			<div class="ml-auto flex items-center gap-1">
				<FilterPopover options={data.options} />
			</div>
		</header>

		<div class="flex shrink-0 items-center gap-2 border-b p-2">
			<div class="min-w-0 flex-1"><FeedSearch /></div>
		</div>

		{#if formError}
			<div class="p-2">
				<Alert.Root variant="destructive">
					<Alert.Description>{formError}</Alert.Description>
				</Alert.Root>
			</div>
		{/if}

		<div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2" role="list">
			{#each entries as entry (entry.kind === 'submission' ? entry.submission.id : `${entry.issue.repoId}:${entry.issue.number}`)}
				<div
					animate:flip={{ duration: 150 }}
					out:fade={{ duration: 150 }}
					role="listitem"
				>
					{#if entry.kind === 'submission'}
						<SubmissionRow
							submission={entry.submission}
							selected={selectedSubmissionId === entry.submission.id}
						/>
					{:else}
						<IssueRow
							issue={entry.issue}
							selected={isSelectedIssue(entry.issue.repo, entry.issue.number)}
						/>
					{/if}
				</div>
			{:else}
				<div class="text-muted-foreground flex flex-1 items-center justify-center p-8 text-center text-sm">
					Inbox zero. Nothing staged or untriaged.
				</div>
			{/each}
		</div>
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>
