<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import AttentionRow from '#lib/components/attention/AttentionRow.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import BlockActionDialog from '#lib/components/board/BlockActionDialog.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import * as Empty from '#lib/components/ui/empty';
	import { classifyAttention, toISODate, type AttentionBuckets } from '#lib/attention';
	import { clockTick } from '#lib/client/clock.svelte';
	import type { CloseReason } from '#lib/client/mutations';
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
	import { cn } from '#lib/utils';
	import type { PageProps } from './$types';

	/**
	 * Attention (SPEC §5.1): blocked issues with a re-check date, grouped
	 * overdue → due today → the next 7 days as dense, scannable rows. Reached
	 * from the sidebar; rows link into the Issues view and can be triaged in
	 * place (reschedule, priority, assignee, done). Dates are compared in the
	 * browser's timezone, and the shared clock re-evaluates "today" at midnight.
	 * The All/Mine switch reuses the `assignee=me` scope, so the sidebar badge
	 * stays global (and counts only overdue + due today).
	 */
	let { data }: PageProps = $props();

	const today = $derived.by(() => {
		clockTick();
		return toISODate(new Date());
	});

	// `assignee=me` is owned by `ViewSegment`, matching the Issues view.
	const mine = $derived(page.url.searchParams.getAll('assignee').includes('me'));
	const viewer = $derived(data.viewerGithubId ?? null);
	const items = $derived(
		mine
			? data.attention.filter((item) =>
					item.issue.assignees.some((person) => person.githubId === viewer)
				)
			: data.attention
	);

	const buckets: AttentionBuckets<AttentionItem> = $derived(classifyAttention(items, today, 7));

	const groups = $derived([
		{
			key: 'overdue',
			label: 'Overdue',
			items: buckets.overdue,
			tone: 'text-destructive'
		},
		{ key: 'today', label: 'Due Today', items: buckets.today, tone: 'text-warning' },
		{
			key: 'upcoming',
			label: 'Upcoming',
			items: buckets.upcoming,
			tone: 'text-muted-foreground'
		}
	]);
	const total = $derived(groups.reduce((sum, group) => sum + group.items.length, 0));

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
					recheck: pendingItem.recheck
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
	description="Blocked issues with a re-check date in the next 7 days."
/>

<div class="surface-shell bg-[var(--surface-canvas)] flex min-h-0 min-w-0 flex-1 flex-col">
	<header
		class="border-[color:var(--surface-divider)] flex h-11 shrink-0 items-center gap-2 border-b px-3"
	>
		<h1 class="text-base font-semibold tracking-tight">Attention</h1>
		<span class="sr-only">Blocked issues with a re-check date in the next 7 days.</span>
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<ViewSegment />
		</div>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if total === 0}
			<Empty.Root class="border-0">
				<Empty.Description>
					{mine
						? 'No blocked issues assigned to you need a re-check in the next 7 days.'
						: 'Nothing needs a re-check in the next 7 days.'}
				</Empty.Description>
			</Empty.Root>
		{:else}
			{#each groups as group (group.key)}
				{#if group.items.length > 0}
					<section aria-label={group.label}>
						<div
							class="bg-[var(--surface-canvas)] sticky top-0 z-20 flex items-center gap-1.5 border-b border-[color:var(--surface-divider)] px-3 py-1.5"
						>
							<h2 class={cn('text-xs font-semibold', group.tone)}>{group.label}</h2>
							<span class="text-muted-foreground/50 text-xs" aria-hidden="true">·</span>
							<span class="mono text-muted-foreground text-xs">{group.items.length}</span>
						</div>
						<div class="divide-y divide-[color:var(--surface-divider)]" role="list">
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
		{/if}
	</div>
</div>

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
