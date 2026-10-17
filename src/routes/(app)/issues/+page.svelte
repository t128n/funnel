<script lang="ts">
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SplitView githubUrl={data.githubUrl}>
	<header class="feed-head">
		<div class="feed-head__row">
			<h1 class="feed-title">Issues</h1>
			<span class="feed-count mono">{data.issues.length}</span>
			<div class="feed-head__actions">
				<ViewSegment />
				<FilterPopover options={data.options} />
			</div>
		</div>
	</header>

	<div class="feed-tools">
		<FeedSearch />
	</div>

	<IssueList issues={data.issues} empty="No issues match these filters." />
</SplitView>

<style>
	.feed-head {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: var(--island-header-height);
		padding: 0 var(--space-sm);
		background: var(--color-island-header);
		flex: none;
	}

	.feed-head__row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex: 1;
		min-width: 0;
	}

	.feed-title {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.01em;
	}

	.feed-count {
		color: var(--color-text-muted);
	}

	.feed-head__actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	/* Secondary toolbar: the feed's search sits below the header band, on the
	   island surface, so every island header stays the same height. */
	.feed-tools {
		display: flex;
		align-items: center;
		padding: var(--space-sm);
		flex: none;
	}
</style>
