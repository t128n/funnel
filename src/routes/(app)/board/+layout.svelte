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

<PageHead
	title="Board"
	description="Issues arranged by workflow status."
/>

<div class="bg-background relative flex min-h-0 min-w-0 flex-1">
	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<header
			class="border-[color:var(--border)] flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 sm:py-0"
		>
			<h1 class="text-xl font-semibold tracking-tight">Board</h1>
			<span class="text-muted-foreground text-xs">{total}</span>
			<div class="order-last w-full min-w-0 sm:order-none sm:mx-auto sm:w-auto sm:max-w-md sm:flex-1 sm:px-2">
				<FeedSearch />
			</div>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<nav class="flex items-center gap-1.5 text-sm" aria-label="Board view">
					{#each viewItems as item, index (item.label)}
						{#if index > 0}
							<span class="text-muted-foreground" aria-hidden="true">|</span>
						{/if}
						<a
							href={item.href}
							class={item.active ? 'link font-semibold' : 'text-muted-foreground hover:underline'}
							aria-current={item.active ? 'page' : undefined}
							onclick={(event) => selectView(event, item)}
						>
							{item.label}
						</a>
					{/each}
				</nav>
				<ViewSegment />
				<FilterPopover options={data.options} />
				{#if !backlogView}
					<BoardShortcuts />
				{/if}
			</div>
		</header>

		{#if backlogView}
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
		{:else}
			<!-- Each projected lane carries its own `total`, `nextCursor`,
			     `loading`, and `loadMore`, so `StatusBoard` can wire infinite
			     scroll without touching the feed stores. -->
			<StatusBoard
				{board}
				wipLimits={data.wipLimits}
				doneDays={data.doneDays}
				repoShortcodes={data.repoShortcodes}
				viewer={data.viewerGithub}
				readonly={!mayWrite}
			/>
		{/if}
	</div>

	<!-- The child detail route docks the Inspector beside the grid (the pane
	     styles its own width/borders when not `fill`ed). -->
	{@render children()}
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
