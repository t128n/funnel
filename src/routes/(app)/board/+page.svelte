<script lang="ts">
	import StatusBoard from '#lib/components/board/StatusBoard.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const total = $derived(
		data.board.columns.reduce((sum, column) => sum + column.issues.length, 0)
	);
</script>

<div class="view">
	<header class="view__head">
		<div class="view__head-row">
			<h1 class="view__title">Board</h1>
			<span class="view__count mono">{total}</span>
			<span class="view__note">
				Done: issues closed in the last {data.doneDays} days
			</span>
			<div class="view__actions">
				<ViewSegment />
				<FilterPopover options={data.options} />
			</div>
		</div>
	</header>

	<div class="view__tools">
		<FeedSearch />
	</div>

	<StatusBoard board={data.board} />
</div>

<style>
	.view {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		min-width: 0;
		background: var(--color-surface-layer-1);
		border-radius: var(--island-radius);
		overflow: hidden;
	}

	.view__head {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: var(--island-header-height);
		padding: 0 var(--space-sm);
		background: var(--color-island-header);
		flex: none;
	}

	.view__head-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex: 1;
		min-width: 0;
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

	.view__note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.view__actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex: none;
	}

	/* Secondary toolbar: search sits on the island surface, below the band, so
	   every view header stays the same height (docs/DESIGN.md §Islands). */
	.view__tools {
		display: flex;
		align-items: center;
		padding: var(--space-sm);
		flex: none;
	}

	.view__tools :global(.search) {
		flex: 1;
		min-width: 0;
	}

	@media (max-width: 980px) {
		.view__note {
			display: none;
		}
	}
</style>
