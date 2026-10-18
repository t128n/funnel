<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import AttentionRow from '#lib/components/attention/AttentionRow.svelte';
	import BlockActionDialog from '#lib/components/board/BlockActionDialog.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import * as Empty from '#lib/components/ui/empty';
	import { classifyAttention, toISODate, type AttentionBuckets } from '#lib/attention';
	import { clockTick } from '#lib/client/clock.svelte';
	import {
		cancelAction,
		confirmBlock,
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
	 * overdue → due today → the next 7 days. Reached from the sidebar; rows link
	 * into the Issues view and can revise the block in place. Dates are compared
	 * in the browser's timezone, and the shared clock re-evaluates "today" at
	 * midnight. The All/Mine switch reuses the `assignee=me` scope and filters
	 * client-side, so the sidebar badge stays global.
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
		{ key: 'overdue', label: 'Overdue', items: buckets.overdue, tone: 'text-destructive' },
		{ key: 'today', label: 'Due today', items: buckets.today, tone: 'text-warning' },
		{ key: 'upcoming', label: 'Upcoming', items: buckets.upcoming, tone: undefined }
	]);
	const total = $derived(groups.reduce((sum, group) => sum + group.items.length, 0));

	const stats = $derived([
		{ key: 'overdue', count: buckets.overdue.length, label: 'overdue', tone: 'text-destructive' },
		{ key: 'today', count: buckets.today.length, label: 'due today', tone: 'text-warning' },
		{ key: 'upcoming', count: buckets.upcoming.length, label: 'upcoming', tone: 'text-foreground' }
	]);

	// One structured dialog for the page; the row menu raises the pending action.
	const pending = $derived(getPendingAction());
	const busy = $derived(isActionBusy());
	const error = $derived(getActionError());
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
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col">
	<header class="flex h-11 shrink-0 items-center gap-2 border-b px-2">
		<h1 class="text-base font-semibold tracking-tight">Attention</h1>
		<span class="mono text-muted-foreground text-xs">{total}</span>
		<span class="sr-only">Blocked issues with a re-check date in the next 7 days.</span>
		<div class="text-muted-foreground ml-1 flex items-center gap-2.5 text-xs max-[1100px]:hidden">
			{#each stats as stat (stat.key)}
				<span class={cn('inline-flex items-baseline gap-1', stat.count === 0 && 'opacity-50')}>
					<span class={cn('mono font-semibold', stat.tone)}>{stat.count}</span>
					<span>{stat.label}</span>
				</span>
			{/each}
		</div>
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<ViewSegment />
		</div>
	</header>

	<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3">
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
					<section class="flex flex-col gap-2" aria-label={group.label}>
						<div
							class="bg-background/95 sticky top-0 z-10 -mx-3 flex items-center gap-2 px-3 py-1.5 backdrop-blur"
						>
							<h2 class={cn('text-sm font-semibold', group.tone)}>{group.label}</h2>
							<span class="mono text-muted-foreground text-xs">{group.items.length}</span>
						</div>
						<div class="flex flex-col gap-1.5" role="list">
							{#each group.items as item (`${item.issue.repoId}:${item.issue.number}`)}
								<AttentionRow {item} {today} />
							{/each}
						</div>
					</section>
				{/if}
			{/each}
		{/if}
	</div>
</div>

<!-- One structured dialog for the page, shared by every row menu. -->
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
