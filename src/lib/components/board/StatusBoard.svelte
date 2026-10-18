<script lang="ts">
	import BoardCard from './BoardCard.svelte';
	import type { StatusBoard as StatusBoardData } from '#lib/server/issues/types';

	interface Props {
		board: StatusBoardData;
	}

	let { board }: Props = $props();
</script>

<div class="board" role="region" aria-label="Status board">
	{#each board.columns as column (column.key)}
		<section class="column" aria-label={column.label}>
			<header class="column__head">
				<span class="column__label">{column.label}</span>
				<span class="column__count mono">{column.issues.length}</span>
			</header>
			<div class="column__body">
				{#each column.issues as issue (`${issue.repoId}:${issue.number}`)}
					<BoardCard {issue} />
				{:else}
					<div class="column__empty">—</div>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.board {
		display: flex;
		gap: var(--space-sm);
		flex: 1;
		min-height: 0;
		padding: var(--space-sm);
		overflow-x: auto;
		overflow-y: hidden;
	}

	/* Lanes live inside the board island, so they use a surface step and a
	   nested radius rather than becoming islands of their own. */
	.column {
		display: flex;
		flex-direction: column;
		width: 240px;
		flex: none;
		min-height: 0;
		background: color-mix(
			in srgb,
			var(--color-surface-layer-2) 40%,
			var(--color-surface-layer-1)
		);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.column__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--island-header-height);
		padding: 0 var(--space-sm);
		background: var(--color-island-header);
		flex: none;
	}

	.column__label {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.column__count {
		color: var(--color-text-muted);
	}

	.column__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-sm);
		overflow-y: auto;
		flex: 1;
	}

	.column__empty {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--space-md);
	}
</style>
