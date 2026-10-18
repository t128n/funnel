<script lang="ts">
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import GroupByControl from '#lib/components/issue/GroupByControl.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import { projectIssues, reconcileIssues } from '#lib/client/optimistic.svelte';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const issues = $derived(projectIssues(data.issues));
	// The open issue is a route param, so the feed highlights it without any
	// query-parameter state.
	const selected = $derived(parseIssueParams(page.params as IssueParams));

	// Drop overlays once the authoritative stream reflects them.
	$effect(() => reconcileIssues(data.issues));
</script>

<SplitView detailOpen={selected !== null}>
	{#snippet feed()}
		<div class="surface-shell bg-[var(--surface-canvas)] flex min-h-0 flex-1 flex-col">
			<header
				class="border-[color:var(--surface-divider)] flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 sm:py-0"
			>
				<h1 class="text-base font-semibold tracking-tight">Issues</h1>
				<span class="mono text-muted-foreground text-xs">{issues.length}</span>
				<div
					class="order-last w-full min-w-0 sm:order-none sm:mx-auto sm:w-auto sm:max-w-md sm:flex-1 sm:px-2"
				>
					<FeedSearch />
				</div>
				<div class="ml-auto flex shrink-0 items-center gap-1">
					<ViewSegment />
					<GroupByControl projects={data.projects} />
					<FilterPopover options={data.options} allowNoStatus={false} showState />
				</div>
			</header>

			<IssueList
				{issues}
				{selected}
				empty="No issues match these filters."
				repoShortcodes={data.repoShortcodes}
				projects={data.projects}
			/>
		</div>
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>
