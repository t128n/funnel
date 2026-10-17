<script lang="ts">
	import FilterBar from '#lib/components/filter/FilterBar.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="view">
	<header class="view__head">
		<h1 class="view__title">Issues</h1>
		<span class="view__count mono">{data.issues.length}</span>
		<div class="view__segment"><ViewSegment /></div>
	</header>

	<FilterBar options={data.options} />

	<IssueList issues={data.issues} empty="No issues match these filters." />
</div>

<style>
	.view {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.view__head {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: var(--topbar-height);
		padding: 0 var(--space-md);
		flex: none;
	}

	.view__title {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.01em;
	}

	.view__count {
		color: var(--color-text-muted);
	}

	.view__segment {
		margin-left: auto;
	}
</style>
