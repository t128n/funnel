<script lang="ts">
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import StateSegment from '#lib/components/filter/StateSegment.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
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
		<header class="flex h-11 shrink-0 items-center gap-2 border-b px-2">
			<h1 class="text-base font-semibold tracking-tight">Issues</h1>
			<span class="mono text-muted-foreground text-xs">{issues.length}</span>
			<div class="ml-auto flex items-center gap-1">
				<ViewSegment />
				<FilterPopover options={data.options} allowNoStatus={false} />
			</div>
		</header>

		<div class="flex shrink-0 items-center gap-2 border-b p-2">
			<div class="min-w-0 flex-1"><FeedSearch /></div>
			<StateSegment />
		</div>

		<IssueList {issues} {selected} empty="No issues match these filters." />
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>
