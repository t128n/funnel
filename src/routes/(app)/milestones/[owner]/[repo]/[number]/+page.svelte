<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import IssueTable from '#lib/components/issue/IssueTable.svelte';
	import ProgressBar from '#lib/components/epics/ProgressBar.svelte';
	import Breadcrumbs from '#lib/components/shell/Breadcrumbs.svelte';
	import AddMilestoneIssueDialog from '#lib/components/milestones/AddMilestoneIssueDialog.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import type { Feed } from '#lib/client/feed.svelte';
	import { projectIssues } from '#lib/client/optimistic.svelte';
	import { isMilestoneOverdue, milestoneDueLabel } from '#lib/milestone-format';
	import { barPercent } from '#lib/planning';
	import { canWrite } from '#lib/roles';
	import type { IssueListItem } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	/**
	 * One milestone, its progress, and the same issue table as `/issues`. The
	 * milestone name is already the page heading, so the table renders issue
	 * titles, labels and status without repeating it in every row.
	 *
	 * The server returns the complete (capped) milestone issue set, so the local
	 * feed is a fixed window with no cursor. Writers can add an issue through the
	 * compact picker; removal is the issue-side Milestone property.
	 */
	let { data }: PageProps = $props();

	const issues = $derived(projectIssues(data.issues));
	const totalIssues = $derived(data.milestone.closedIssues + data.milestone.openIssues);
	const mayWrite = $derived(canWrite(data.user?.role));
	const candidates = $derived(data.candidates ?? []);
	const now = Date.now();

	let dialogOpen = $state(false);

	const feed: Feed<IssueListItem> = {
		get items() {
			return issues;
		},
		get total() {
			return issues.length;
		},
		get nextCursor() {
			return null;
		},
		get loading() {
			return false;
		},
		get error() {
			return null;
		},
		sync() {},
		remove() {},
		retain() {},
		loadMore: async () => {},
		refreshLoaded: async () => {}
	};

	function dueLabel(dueOn: number | null): string {
		return milestoneDueLabel(dueOn) ?? 'No due date';
	}
</script>

{#snippet pageActions()}
	{#if mayWrite}
		<Button color="primary" size="sm" onclick={() => (dialogOpen = true)}>
			<i class="bi bi-plus-lg me-1" aria-hidden="true"></i>
			Add issues
		</Button>
	{/if}
{/snippet}
<PageHead
	title={data.milestone.title || 'Milestone'}
	description={data.milestone.description || undefined}
/>

<main class="container-xl py-4">
	<Breadcrumbs
		items={[
			{ label: 'Workspace', href: '/issues' },
			{ label: 'Milestones', href: '/milestones' },
			{ label: data.milestone.title || 'Untitled milestone' }
		]}
	/>

	<PageHeader
		title={data.milestone.title || 'Untitled milestone'}
		description={data.milestone.description || undefined}
		actions={pageActions}
	/>

	<div class="d-flex flex-wrap align-items-baseline column-gap-3 row-gap-1 pb-3 small text-body-secondary">
		<span>{data.milestone.repo}#{data.milestone.number}</span>
		{#if isMilestoneOverdue(data.milestone, now)}
			<span class="text-danger text-nowrap">
				<i class="bi bi-exclamation-circle me-1" aria-hidden="true"></i>
				Overdue · {dueLabel(data.milestone.dueOn)}
			</span>
		{:else}
			<span>{data.milestone.dueOn === null ? 'No due date' : `Due ${dueLabel(data.milestone.dueOn)}`}</span>
		{/if}
		{#if data.milestone.state === 'closed'}
			<StatusText state="closed" />
		{:else}
			<StatusText status="open" />
		{/if}
		<span class="d-inline-flex align-items-center gap-2">
			<span>{data.milestone.closedIssues} / {totalIssues} closed</span>
			<ProgressBar value={barPercent(data.milestone.closedIssues, totalIssues)} />
		</span>
	</div>

	{#if issues.length === 0}
		<EmptyState
			title="No issues are attached to this milestone."
			description="Add an issue from the button above, or set an issue's Milestone in its Properties."
			class="border-top border-bottom py-4"
		/>
	{:else}
		<IssueTable
			{feed}
			repoShortcodes={data.repoShortcodes}
			projects={data.projects}
		/>
	{/if}
</main>

{#if mayWrite}
	<AddMilestoneIssueDialog
		open={dialogOpen}
		repo={data.milestone.repo}
		milestoneNumber={data.milestone.number}
		{candidates}
		onopenchange={(open) => (dialogOpen = open)}
	/>
{/if}
