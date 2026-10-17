<script lang="ts">
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import SubmissionRow from '#lib/components/inbox/SubmissionRow.svelte';
	import IssueRow from '#lib/components/issue/IssueRow.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import { parseSelection, selectedIssue } from '#lib/client/selection.svelte';
	import type { StagedSubmission } from '#lib/server/intake/staging';
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
	const selectedSubmission = $derived.by((): StagedSubmission | null => {
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
	<header class="feed-head">
		<div class="feed-head__row">
			<h1 class="feed-title">Inbox</h1>
			<span class="feed-count mono">{data.inbox.entries.length}</span>
			<div class="feed-head__actions">
				<FilterPopover options={data.options} />
			</div>
		</div>
	</header>

	<div class="feed-tools">
		<FeedSearch />
	</div>

	{#if formError}
		<div class="banner banner--error">{formError}</div>
	{/if}

	<div class="stream" role="list">
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
			<div class="empty">Inbox zero. Nothing staged or untriaged.</div>
		{/each}
	</div>
</SplitView>

<style>
	.feed-head {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: var(--island-header-height);
		padding: 0 var(--space-sm);
		background: var(--color-island-header);
		flex: none;
	}

	.feed-head__row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex: 1;
		min-width: 0;
	}

	.feed-title {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.01em;
	}

	.feed-count {
		color: var(--color-text-muted);
	}

	.feed-head__actions {
		margin-left: auto;
	}

	/* Secondary toolbar: the feed's search sits below the header band, on the
	   island surface, so every island header stays the same height. */
	.feed-tools {
		display: flex;
		align-items: center;
		padding: var(--space-sm);
		flex: none;
	}

	.stream {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-sm);
	}

	.banner {
		margin: var(--space-sm) var(--space-sm) 0;
		padding: var(--space-sm);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.banner--error {
		background: color-mix(in srgb, var(--color-accent-red) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-accent-red) 40%, transparent);
		color: var(--color-accent-red);
	}

	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-xxl);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		text-align: center;
	}
</style>
