<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '@sveltestrap/sveltestrap';
	import AttentionRow from '#lib/components/attention/AttentionRow.svelte';
	import WaitingRow from '#lib/components/attention/WaitingRow.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import Breadcrumbs from '#lib/components/shell/Breadcrumbs.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import BlockActionDialog from '#lib/components/board/BlockActionDialog.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import { classifyAttention, toISODate, type AttentionBuckets } from '#lib/attention';
	import { clockTick } from '#lib/client/clock.svelte';
	import type { CloseReason } from '#lib/client/mutations';
	import { canWrite } from '#lib/roles';
	import {
		cancelAction,
		confirmBlock,
		confirmResolve,
		getActionError,
		getPendingAction,
		isActionBusy,
		type BlockPayload
	} from '#lib/client/issue-actions.svelte';
	import type { AttentionItem } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	/**
	 * Attention (SPEC §5.1): blocked issues grouped overdue → due today → the next
	 * 7 days → no re-check date, as ruled, scannable rows. Reached from the
	 * sidebar; rows link into the Issues view and can be triaged in place
	 * (reschedule, assignee, done). Dates are compared in the browser's timezone,
	 * and the shared clock re-evaluates "today" at midnight. The All/Mine switch
	 * reuses the `assignee=me` scope, so the sidebar badge stays global (and
	 * counts only overdue + due today).
	 */
	let { data }: PageProps = $props();

	const today = $derived.by(() => {
		clockTick();
		return toISODate(new Date());
	});

	// `assignee=me` is owned by `ViewSegment`, matching the Issues view.
	const mine = $derived(page.url.searchParams.getAll('assignee').includes('me'));
	const viewer = $derived(data.viewerExternalId ?? null);
	const assignedToViewer = (item: { issue: { assignees: { externalId: string }[] } }) =>
		item.issue.assignees.some((person) => person.externalId === viewer);

	const items = $derived(mine ? data.attention.filter(assignedToViewer) : data.attention);
	const waitingItems = $derived(mine ? data.waiting.filter(assignedToViewer) : data.waiting);

	const buckets: AttentionBuckets<AttentionItem> = $derived(classifyAttention(items, today, 7));

	const groups = $derived([
		{ key: 'overdue', label: 'Re-check overdue', items: buckets.overdue },
		{ key: 'today', label: 'Re-check today', items: buckets.today },
		{ key: 'upcoming', label: 'Re-check upcoming', items: buckets.upcoming },
		{ key: 'unscheduled', label: 'No re-check date', items: buckets.unscheduled }
	]);
	const blockedTotal = $derived(groups.reduce((sum, group) => sum + group.items.length, 0));
	const total = $derived(blockedTotal + waitingItems.length);
	const countLabel = $derived(
		[
			blockedTotal === 1 ? '1 blocked issue' : `${blockedTotal} blocked issues`,
			waitingItems.length === 1 ? '1 waiting' : `${waitingItems.length} waiting`
		].join(' · ')
	);
	const mayWrite = $derived(canWrite(data.user?.role));
	const staleWaiting = $derived(waitingItems.filter((item) => item.stale).length);

	// One structured dialog set for the page; the row menus raise the action.
	const pending = $derived(getPendingAction());
	const busy = $derived(isActionBusy());
	const error = $derived(getActionError());
	const resolveMode = $derived(pending?.kind === 'resolve' ? pending.mode : 'close');
	const blockMode = $derived(pending?.kind === 'block' ? pending.mode : 'block');

	/** The blocked issue being revised, so the dialog can prefill its fields. */
	const pendingItem = $derived(
		pending
			? (data.attention.find(
					(entry) =>
						entry.issue.repo === pending.issue.repo &&
						entry.issue.number === pending.issue.number
				) ?? null)
			: null
	);
	const blockInitial = $derived(
		pendingItem
			? {
					blocker: pendingItem.blocker,
					needs: pendingItem.needs,
					trying: pendingItem.trying,
					recheck: pendingItem.recheck,
					reason: pendingItem.reason
				}
			: undefined
	);

	async function handleBlockConfirm(payload: BlockPayload) {
		await confirmBlock(payload);
		// Re-check dates live in the issue body, so there is no optimistic
		// overlay for them — reload once a successful write lands.
		if (getPendingAction() === null) void invalidateAll();
	}

	async function handleResolveConfirm(payload: { reason: CloseReason; note: string }) {
		await confirmResolve(payload);
		// Closing drops the issue out of the Attention feed, so reload.
		if (getPendingAction() === null) void invalidateAll();
	}
</script>

<PageHead
	title="Attention"
	description="Blocked issues grouped by re-check date, plus issues waiting on someone else."
/>

<main class="container-xl py-4">
	<Breadcrumbs items={[{ label: 'Workspace', href: '/issues' }, { label: 'Attention' }]} />

	<PageHeader
		title="Attention"
		count={countLabel}
		description="Blocked issues grouped by re-check date, plus issues waiting on someone else."
	/>

	<Toolbar>
		<ViewSegment />
	</Toolbar>

	{#if total === 0}
		<div class="border rounded bg-body-tertiary">
			<EmptyState
				title={mine ? 'Nothing needs attention in your issues.' : 'Nothing needs attention.'}
			>
				{#snippet action()}
					{#if mine}
						<Button color="outline-secondary" size="sm" href="/attention">Show all</Button>
					{:else}
						<Button color="outline-secondary" size="sm" href="/issues">View all issues</Button>
					{/if}
				{/snippet}
			</EmptyState>
		</div>
	{:else}
		{#each groups as group (group.key)}
			{#if group.items.length > 0}
				<section aria-labelledby={`attention-${group.key}`} class="mb-4">
					<div class="d-flex align-items-center gap-2 border-bottom pb-1 mb-2">
						<h2
							id={`attention-${group.key}`}
							class="small text-body-secondary mb-0"
						>
							{group.label}
						</h2>
						<span class="small text-body-tertiary tabular">{group.items.length}</span>
					</div>
					<div role="list" class="border rounded">
						{#each group.items as item (`${item.issue.repoId}:${item.issue.number}`)}
							<AttentionRow
								{item}
								{today}
								repoShortcodes={data.repoShortcodes}
								viewer={data.viewerGithub}
							/>
						{/each}
					</div>
				</section>
			{/if}
		{/each}

		{#if waitingItems.length > 0}
			<section aria-labelledby="attention-waiting" class="mb-4">
				<div class="d-flex align-items-center gap-2 border-bottom pb-1 mb-2">
					<h2 id="attention-waiting" class="small text-body-secondary mb-0">
						Waiting on others
					</h2>
					<span class="small text-body-tertiary tabular">{waitingItems.length}</span>
					{#if staleWaiting > 0}
						<span class="badge text-bg-warning">{staleWaiting} stale</span>
					{/if}
				</div>
				<p class="small text-body-secondary mb-2">
					Parked until the reporter, a vendor or an upstream project responds.
					Clearing the state is immediate and never edits the issue body.
				</p>
				<div role="list" class="border rounded">
					{#each waitingItems as item (`${item.issue.repoId}:${item.issue.number}`)}
						<WaitingRow
							{item}
							repoShortcodes={data.repoShortcodes}
							{mayWrite}
						/>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</main>

<!-- One structured dialog set for the page, shared by every row menu. -->
<IssueActionDialog
	open={pending?.kind === 'resolve'}
	mode={resolveMode}
	{busy}
	{error}
	onopenchange={(open) => {
		if (!open) cancelAction();
	}}
	onconfirm={(payload) => void handleResolveConfirm(payload)}
/>
<BlockActionDialog
	open={pending?.kind === 'block'}
	mode={blockMode}
	{busy}
	{error}
	initial={blockInitial}
	onopenchange={(open) => {
		if (!open) cancelAction();
	}}
	onconfirm={(payload) => void handleBlockConfirm(payload)}
/>

<style>
	.tabular {
		font-variant-numeric: tabular-nums;
	}
</style>
