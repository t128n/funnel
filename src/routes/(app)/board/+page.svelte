<script lang="ts">
	import StatusBoard from '#lib/components/board/StatusBoard.svelte';
	import FilterBar from '#lib/components/filter/FilterBar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="view">
	<header class="view__head">
		<h1 class="view__title">Board</h1>
		<span class="view__note">Done shows issues closed in the last {data.doneDays} days</span>
	</header>

	<FilterBar options={data.options} />

	<StatusBoard board={data.board} />
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
		align-items: baseline;
		gap: var(--space-md);
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

	.view__note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
</style>
