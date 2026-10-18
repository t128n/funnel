<script lang="ts">
	import { page } from '$app/state';
	import { createHotkeys, getAppHotkeys } from '@tanstack/svelte-hotkeys';
	import BlockActionDialog from '#lib/components/board/BlockActionDialog.svelte';
	import StatusBoard from '#lib/components/board/StatusBoard.svelte';
	import SegmentedControl from '#lib/components/common/SegmentedControl.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import { requestFocusedCardMenu } from '#lib/client/board-ui.svelte';
	import {
		cancelAction,
		confirmBlock,
		confirmResolve,
		getActionError,
		getPendingAction,
		isActionBusy
	} from '#lib/client/issue-actions.svelte';
	import { projectBoard, reconcileIssues } from '#lib/client/optimistic.svelte';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const board = $derived(projectBoard(data.board));
	const backlog = $derived(board.columns.find((column) => column.key === 'backlog')?.issues ?? []);
	const total = $derived(
		board.columns.reduce((sum, column) => sum + column.issues.length, 0)
	);

	// Backlog is a separate list view, not a board lane (SPEC §9.3).
	const backlogView = $derived(page.url.searchParams.get('view') === 'backlog');
	const selected = $derived(parseIssueParams(page.params as IssueParams));

	const viewItems = $derived([
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

	// Drop overlays once the authoritative board reflects them.
	$effect(() => reconcileIssues(data.board.columns.flatMap((column) => column.issues)));

	const pending = $derived(getPendingAction());
	const busy = $derived(isActionBusy());
	const error = $derived(getActionError());
	const resolveMode = $derived(pending?.kind === 'resolve' ? pending.mode : 'close');
	const blockMode = $derived(pending?.kind === 'block' ? pending.mode : 'block');

	// `S` changes the focused card's status; the board shares one dialog so the
	// menu and drag-and-drop both route through `issue-actions`.
	const hotkeys = getAppHotkeys();
	createHotkeys(() => [
		{ hotkey: hotkeys.current['issue.status'], callback: requestFocusedCardMenu }
	]);
</script>

<div class="relative flex min-h-0 min-w-0 flex-1">
	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<header class="flex h-11 shrink-0 items-center gap-2 border-b px-2">
			<h1 class="text-base font-semibold tracking-tight">Board</h1>
			<span class="mono text-muted-foreground text-xs">{total}</span>
			<div class="ml-auto flex shrink-0 items-center gap-1">
				<SegmentedControl label="Board view" items={viewItems} />
				<ViewSegment />
				<FilterPopover options={data.options} />
			</div>
		</header>

		<div class="flex shrink-0 items-center gap-2 border-b p-2">
			<div class="min-w-0 flex-1"><FeedSearch /></div>
		</div>

		{#if backlogView}
			<IssueList issues={backlog} {selected} empty="Backlog is empty." />
		{:else}
			<StatusBoard {board} wipLimits={data.wipLimits} doneDays={data.doneDays} />
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
