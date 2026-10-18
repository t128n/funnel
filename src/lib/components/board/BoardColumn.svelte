<script lang="ts">
	import BoardCard from './BoardCard.svelte';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { BoardItem } from './item';
	import { canonicalLabel } from '#lib/labels';
	import { cn } from '#lib/utils';
	import PlusIcon from '@lucide/svelte/icons/plus';

	interface Props {
		/** Column identity: canonical status key (`done` is the closed window). */
		statusKey: string;
		label: string;
		items: BoardItem[];
		/** Optional Work-in-Progress cap; `undefined` means unlimited. */
		limit?: number;
		/** Done retention window, surfaced as the Done column's tooltip. */
		doneDays?: number;
		onconsider: (event: CustomEvent<DndEvent<BoardItem>>) => void;
		onfinalize: (event: CustomEvent<DndEvent<BoardItem>>) => void;
	}

	let { statusKey, label, items, limit, doneDays, onconsider, onfinalize }: Props = $props();

	const isDone = $derived(statusKey === 'done');
	const color = $derived(canonicalLabel(statusKey)?.color);
	const dotStyle = $derived(
		isDone
			? 'background: var(--syntax-constant)'
			: color
				? `background: ${/^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color}`
				: undefined
	);

	// The library keeps the shadow of a dragged card in the source list; it must
	// not count toward the column total.
	const realItems = $derived(items.filter((item) => !item.isDndShadowItem));
	const overLimit = $derived(limit !== undefined && realItems.length > limit);
</script>

<section
	class={cn(
		'bg-muted/40 flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border',
		isDone && 'bg-muted/20'
	)}
	aria-label={label}
	title={isDone && doneDays !== undefined ? `Issues closed in the last ${doneDays} days` : undefined}
>
	<header class="flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
		<span class="size-2 shrink-0 rounded-full" style={dotStyle}></span>
		<span class="text-xs font-semibold tracking-wide">{label}</span>
		<span
			class={cn('mono text-muted-foreground text-xs', overLimit && 'text-warning font-medium')}
			title={limit !== undefined ? `${realItems.length} of ${limit} (WIP limit)` : undefined}
		>
			{realItems.length}{limit !== undefined ? ` / ${limit}` : ''}
		</span>
		<div class="ml-auto flex items-center">
			{#if !isDone}
				<a
					href="/submit"
					class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-6 items-center justify-center rounded outline-none focus-visible:ring-1"
					title="New issue"
					aria-label={`New issue in ${label}`}
				>
					<PlusIcon class="size-3.5" />
				</a>
			{/if}
		</div>
	</header>

	<div class="relative min-h-0 flex-1">
		<div
			class="flex min-h-full flex-col gap-2 overflow-y-auto p-2"
			use:dndzone={{
				items,
				type: 'board',
				flipDurationMs: 150,
				dropTargetClasses: ['bg-accent/50']
			}}
			onconsider={onconsider}
			onfinalize={onfinalize}
		>
			{#each items as item (item.id)}
				<div
					animate:flip={{ duration: 150 }}
					class={item.isDndShadowItem ? 'h-14 shrink-0 rounded-lg border border-dashed' : undefined}
					aria-hidden={item.isDndShadowItem ? 'true' : undefined}
				>
					{#if !item.isDndShadowItem}
						<BoardCard issue={item.issue} />
					{/if}
				</div>
			{/each}
		</div>

		{#if realItems.length === 0}
			<div
				class="text-muted-foreground/70 pointer-events-none absolute inset-2 flex items-center justify-center rounded-lg border border-dashed text-xs"
			>
				Drop issues here
			</div>
		{/if}
	</div>
</section>
