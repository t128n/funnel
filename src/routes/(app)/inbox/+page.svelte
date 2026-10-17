<script lang="ts">
	import { page } from '$app/state';
	import FilterBar from '#lib/components/filter/FilterBar.svelte';
	import SubmissionRow from '#lib/components/inbox/SubmissionRow.svelte';
	import IssueRow from '#lib/components/issue/IssueRow.svelte';
	import { parseSelection } from '#lib/client/selection.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const selection = $derived(parseSelection());
	const formError = $derived(
		page.form && 'message' in (page.form.data ?? {})
			? (page.form.data as { message?: string }).message
			: null
	);

	function isSelected(repo: string, number: number): boolean {
		return (
			selection !== null &&
			selection.number === number &&
			selection.repo === repo
		);
	}
</script>

<div class="view">
	<header class="view__head">
		<h1 class="view__title">Inbox</h1>
		<span class="view__count mono">{data.inbox.entries.length}</span>
	</header>

	<FilterBar options={data.options} />

	{#if formError}
		<div class="banner banner--error">{formError}</div>
	{/if}

	<div class="stream">
		{#each data.inbox.entries as entry, i (entry.kind === 'submission' ? entry.submission.id : `${entry.issue.repoId}:${entry.issue.number}`)}
			{#if entry.kind === 'submission'}
				<SubmissionRow
					submission={entry.submission}
					repos={data.options.repos.map((repo) => repo.slug)}
					defaultRepo={data.defaultRepo}
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
</div>

<style>
	.view {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.view__head {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
		height: var(--topbar-height);
		padding: 0 var(--space-md);
		flex: none;
	}

	.view__title {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.01em;
	}

	.view__count {
		color: var(--color-text-muted);
	}

	.stream {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.banner {
		margin: 0 var(--space-md);
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
	}
</style>
