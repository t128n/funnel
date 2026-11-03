<script lang="ts">
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '@sveltestrap/sveltestrap';
	import SubmissionDetail from '#lib/components/inbox/SubmissionDetail.svelte';
	import type { RenderedSubmission } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	// Resolve the staged submission from the layout's raw queue, not the
	// projected one, so an optimistically removed row keeps its detail pane open
	// until the triage action settles.
	const submission = $derived.by((): RenderedSubmission | null => {
		for (const entry of data.inbox.entries) {
			if (entry.kind === 'submission' && entry.submission.id === params.id) {
				return entry.submission;
			}
		}
		return null;
	});

	const repos = $derived(data.options.repos.map((repo) => repo.slug));
</script>

{#if submission}
	<PageHead title={`${submission.title} · Inbox`} />
	<SubmissionDetail {submission} {repos} defaultRepo={data.defaultRepo} />
{:else}
	<PageHead title="Submission · Inbox" />
	<EmptyState
		title="Submission unavailable"
		description="This submission is no longer staged."
		class="h-100"
	>
		{#snippet action()}
			<Button color="outline-secondary" size="sm" href="/inbox">Back to Inbox</Button>
		{/snippet}
	</EmptyState>
{/if}
