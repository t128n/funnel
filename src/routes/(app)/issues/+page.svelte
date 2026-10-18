<script lang="ts">
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import StateSegment from '#lib/components/filter/StateSegment.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SplitView githubUrl={data.githubUrl}>
	<header class="flex h-11 shrink-0 items-center gap-2 border-b px-2">
		<h1 class="text-base font-semibold tracking-tight">Issues</h1>
		<span class="mono text-muted-foreground text-xs">{data.issues.length}</span>
		<div class="ml-auto flex items-center gap-1">
			<ViewSegment />
			<FilterPopover options={data.options} allowNoStatus={false} />
		</div>
	</header>

	<div class="flex shrink-0 items-center gap-2 border-b p-2">
		<div class="min-w-0 flex-1"><FeedSearch /></div>
		<StateSegment />
	</div>

	<IssueList issues={data.issues} empty="No issues match these filters." />
</SplitView>
