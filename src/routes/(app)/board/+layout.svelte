<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { createHotkeys, getAppHotkeys } from '@tanstack/svelte-hotkeys';
	import BlockActionDialog from '#lib/components/board/BlockActionDialog.svelte';
	import BoardShortcuts from '#lib/components/board/BoardShortcuts.svelte';
	import StatusBoard from '#lib/components/board/StatusBoard.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import { requestFocusedCardMenu, requestFocusedCardOpen } from '#lib/client/board-ui.svelte';
	import { createBoardFeed } from '#lib/client/board-feed.svelte';
	import {
		cancelAction,
		confirmBlock,
		confirmResolve,
		getActionError,
		getPendingAction,
		isActionBusy
	} from '#lib/client/issue-actions.svelte';
	import { projectIssues, reconcileIssues } from '#lib/client/optimistic.svelte';
	import { canWrite } from '#lib/roles';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** RBAC `read` viewers can browse the board but not drag or triage. */
	const mayWrite = $derived(canWrite(data.user.role));

	// One keyset feed per lane; the server-rendered first page seeds them and
	// every SSE refresh merges into the loaded windows rather than resetting.
	const boardFeed = untrack(() =>
		createBoardFeed(data.board, () => page.url.search)
	);
	const board = $derived(boardFeed.board());
	const total = $derived(boardFeed.total());

	// Backlog is a separate list view, not a board lane (SPEC §9.3).
	const backlogView = $derived(page.url.searchParams.get('view') === 'backlog');
	const selected = $derived(parseIssueParams(page.params as IssueParams));

	// Keep the loaded windows current as fresh loads/SSE land.
	$effect(() => {
		boardFeed.sync(data.board);
	});

	interface ViewItem {
		label: string;
		href: string;
		active: boolean;
	}

	const viewItems = $derived<ViewItem[]>([
		{ label: 'Board', href: viewHref(false), active: !backlogView },
		{ label: 'Backlog', href: viewHref(true), active: backlogView }
	]);

	/** Preserve the current path/query (and any docked detail) while toggling. */
	function viewHref(backlog: boolean): string {
		const params = new URLSearchParams();
		page.url.searchParams.forEach((value, key) => params.append(key, value));
		if (backlog) params.set('view', 'backlog');
		else params.delete('view');
		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}

	/** Let modified clicks open a new tab; otherwise navigate without a reset. */
	function selectView(event: MouseEvent, item: ViewItem) {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}
		event.preventDefault();
		if (!item.active) void goto(item.href, { reset: false });
	}

	// Drop overlays once the authoritative board reflects them. Reconcile from
	// the raw lane windows (the projection would always look satisfied).
	$effect(() => reconcileIssues(Object.values(boardFeed.columns).flatMap((feed) => feed.items)));

	const pending = $derived(getPendingAction());
	const busy = $derived(isActionBusy());
	const error = $derived(getActionError());
	const resolveMode = $derived(pending?.kind === 'resolve' ? pending.mode : 'close');
	const blockMode = $derived(pending?.kind === 'block' ? pending.mode : 'block');

	// `S` changes the focused card's status; the board shares one dialog so the
	// menu and drag-and-drop both route through `issue-actions`.
	const hotkeys = getAppHotkeys();
	createHotkeys(() => [
		{ hotkey: hotkeys.current['issue.status'], callback: requestFocusedCardMenu },
		{ hotkey: hotkeys.current['issue.select'], callback: requestFocusedCardOpen }
	]);
</script>

<PageHead title="Board" description="Issues arranged by workflow status." />

<div class="position-relative d-flex min-h-0 min-w-0 flex-grow-1">
	<div
		class="min-h-0 min-w-0 flex-grow-1 flex-column overflow-y-auto {selected
			? 'd-none d-lg-flex'
			: 'd-flex'}"
	>
		<PageHeader
			title={backlogView ? 'Backlog' : 'Board'}
			count={backlogView ? boardFeed.columns.backlog.total : total}
			level={selected ? 2 : 1}
		>
			{#snippet actions()}
				<!-- Board view tabs: real links with a 2px primary underline, no fill. -->
				<nav class="d-flex align-items-center gap-4" aria-label="Board view">
					{#each viewItems as item (item.label)}
						<a
							href={item.href}
							class="board-view-tab d-inline-flex align-items-center pb-1 text-decoration-none"
							aria-current={item.active ? 'page' : undefined}
							onclick={(event) => selectView(event, item)}
						>
							{item.label}
						</a>
					{/each}
				</nav>
			{/snippet}
		</PageHeader>

		<Toolbar>
			<div class="min-w-0 flex-grow-1">
				<FeedSearch />
			</div>
			<ViewSegment />
			<FilterPopover options={data.options} />
			{#snippet actions()}
				{#if !backlogView}
					<BoardShortcuts />
				{/if}
			{/snippet}
		</Toolbar>

		{#if backlogView}
			<div class="board-canvas d-flex flex-column flex-grow-1">
				<IssueList
					feed={boardFeed.columns.backlog}
					project={(issues) =>
						projectIssues(issues).filter(
							(issue) => issue.state !== 'closed' && issue.status === 'backlog'
						)}
					{selected}
					empty="Backlog is empty."
					repoShortcodes={data.repoShortcodes}
					groupable={false}
				/>
			</div>
		{:else}
			<!-- Each projected lane carries its own `total`, `nextCursor`,
			     `loading`, and `loadMore`, so `StatusBoard` can wire infinite
			     scroll without touching the feed stores. -->
			<div class="board-canvas d-flex flex-column flex-grow-1">
				<StatusBoard
					{board}
					{selected}
					wipLimits={data.wipLimits}
					doneDays={data.doneDays}
					repoShortcodes={data.repoShortcodes}
					viewer={data.viewerGithub}
					readonly={!mayWrite}
				/>
			</div>
		{/if}
	</div>

	<!-- The child detail route docks the Inspector beside the grid above 992px
	     and takes the full width below it. -->
	<div class={selected ? 'd-flex min-h-0 min-w-0 flex-grow-1' : 'd-none d-lg-flex'}>
		{@render children()}
	</div>
</div>

<!-- One structured dialog set for the whole board, shared by the card menu, the
     `S` shortcut, and drops into/out of Done. -->
<IssueActionDialog
	open={pending?.kind === 'resolve'}
	mode={resolveMode}
	{busy}
	{error}
	onopenchange={(open) => {
		if (!open) cancelAction();
	}}
	onconfirm={(payload) => void confirmResolve(payload)}
/>
<BlockActionDialog
	open={pending?.kind === 'block'}
	mode={blockMode}
	{busy}
	{error}
	onopenchange={(open) => {
		if (!open) cancelAction();
	}}
	onconfirm={(payload) => void confirmBlock(payload)}
/>

<style>
	.board-view-tab {
		border-bottom: 2px solid transparent;
		color: var(--bs-secondary-color);
		font-size: 0.875rem;
	}

	.board-view-tab:hover {
		color: var(--bs-body-color);
	}

	.board-view-tab[aria-current='page'] {
		border-bottom-color: var(--bs-primary);
		color: var(--bs-body-color);
		font-weight: 600;
	}

	.board-canvas {
		min-height: 30svh;
	}
</style>
