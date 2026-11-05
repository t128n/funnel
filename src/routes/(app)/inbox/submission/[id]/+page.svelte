<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import SubmissionDetail from '#lib/components/inbox/SubmissionDetail.svelte';
	import Breadcrumbs from '#lib/components/shell/Breadcrumbs.svelte';
	import type { RenderedSubmission } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	// Resolve the staged submission from the layout's raw queue, not the
	// projected one, so an optimistically removed row keeps its review page open
	// until the triage action settles.
	const submission = $derived.by((): RenderedSubmission | null => {
		for (const entry of data.inbox.entries) {
			if (entry.kind === 'submission' && entry.submission.id === params.id) {
				return entry.submission;
			}
		}
		return data.archivedSubmission;
	});

	const repos = $derived(data.options.repos.map((repo) => repo.slug));
	const labelOptions = $derived(data.options.labels);
	const assigneeOptions = $derived(
		data.options.assignees.map((assignee) => assignee.login)
	);
</script>

<main class="container-xl py-4">
	<Breadcrumbs items={[{ label: 'Inbox', href: '/inbox' }, { label: 'Submission' }]} />

	{#if submission}
		<PageHead title={`${submission.title} · Inbox`} />
		<SubmissionDetail
			{submission}
			{repos}
			{labelOptions}
			{assigneeOptions}
			defaultRepo={data.defaultRepo}
			undoEventId={data.archivedUndoEventId}
		/>
	{:else}
		<PageHead title="Submission · Inbox" />
		<EmptyState
			title="Submission unavailable"
			description="This submission is no longer staged."
		>
			{#snippet action()}
				<Button color="outline-secondary" size="sm" href="/inbox">Back to Inbox</Button>
			{/snippet}
		</EmptyState>
	{/if}
</main>
