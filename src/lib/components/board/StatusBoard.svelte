<script lang="ts">
	import BoardCard from './BoardCard.svelte';
	import type { StatusBoard as StatusBoardData } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';

	interface Props {
		board: StatusBoardData;
	}

	let { board }: Props = $props();

	const isDone = (key: string) => key === 'done';
</script>

<div class="flex min-h-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden p-2" role="region" aria-label="Status board">
	{#each board.columns as column (column.key)}
		<section
			class={cn(
				'bg-muted/40 flex w-60 shrink-0 flex-col overflow-hidden border',
				isDone(column.key) && 'bg-muted/20'
			)}
			aria-label={column.label}
		>
			<header class="flex h-10 shrink-0 items-center justify-between border-b px-2">
				<span class="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
					{column.label}
				</span>
				<span class="mono text-muted-foreground text-xs">{column.issues.length}</span>
			</header>
			<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
				{#each column.issues as issue (`${issue.repoId}:${issue.number}`)}
					<BoardCard {issue} />
				{:else}
					<div class="text-muted-foreground p-3 text-center text-xs">—</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
