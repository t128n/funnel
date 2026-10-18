<script lang="ts">
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import SubmissionRow from '#lib/components/inbox/SubmissionRow.svelte';
	import IssueRow from '#lib/components/issue/IssueRow.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import * as Alert from '#lib/components/ui/alert';
	import { parseSelection, selectedIssue } from '#lib/client/selection.svelte';
	import type { RenderedSubmission } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const selection = $derived(parseSelection());
	const issue = $derived(selectedIssue(selection));
	const formError = $derived(
		page.form && 'message' in (page.form.data ?? {})
			? (page.form.data as { message?: string }).message
			: null
	);

	// The submission picked by `?submission=`, resolved from the loaded queue.
	const selectedSubmission = $derived.by((): RenderedSubmission | null => {
		if (selection?.kind !== 'submission') return null;
		for (const entry of data.inbox.entries) {
			if (entry.kind === 'submission' && entry.submission.id === selection.id) {
				return entry.submission;
			}
		}
		return null;
	});

	function isSelected(repo: string, number: number): boolean {
		return issue !== null && issue.number === number && issue.repo === repo;
	}
</script>

<SplitView
	githubUrl={data.githubUrl}
	submission={selectedSubmission}
	repos={data.options.repos.map((repo) => repo.slug)}
	defaultRepo={data.defaultRepo}
>
	<header class="flex h-11 shrink-0 items-center gap-2 border-b px-2">
		<h1 class="text-base font-semibold tracking-tight">Inbox</h1>
		<span class="mono text-muted-foreground text-xs">{data.inbox.entries.length}</span>
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
		{#each data.inbox.entries as entry (entry.kind === 'submission' ? entry.submission.id : `${entry.issue.repoId}:${entry.issue.number}`)}
			{#if entry.kind === 'submission'}
				<SubmissionRow
					submission={entry.submission}
					selected={selection?.kind === 'submission' &&
						selection.id === entry.submission.id}
				/>
			{:else}
				<IssueRow
					issue={entry.issue}
					selected={isSelected(entry.issue.repo, entry.issue.number)}
				/>
			{/if}
		{:else}
			<div class="text-muted-foreground flex flex-1 items-center justify-center p-8 text-center text-sm">
				Inbox zero. Nothing staged or untriaged.
			</div>
		{/each}
	</div>
</SplitView>
