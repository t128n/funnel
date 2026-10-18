<script lang="ts">
	import BoardCard from './BoardCard.svelte';
	import StatusIcon from '#lib/components/common/StatusIcon.svelte';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { BoardItem } from './item';
	import type { UserRef } from '#lib/server/issues/types';
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
		/** `owner/name` → project key, forwarded to every card. */
		repoShortcodes: Record<string, string>;
		/** Show the repository context tag when the board spans multiple repos. */
		showRepo?: boolean;
		/** Signed-in viewer for the card's quick assign action. */
		viewer?: UserRef | null;
		/** Card key that owns the roving tab stop for this column. */
		activeKey?: string | null;
		onconsider: (event: CustomEvent<DndEvent<BoardItem>>) => void;
		onfinalize: (event: CustomEvent<DndEvent<BoardItem>>) => void;
	}

	let {
		statusKey,
		label,
		items,
		limit,
		doneDays,
		repoShortcodes,
		showRepo = false,
		viewer = null,
		activeKey = null,
		onconsider,
		onfinalize
	}: Props = $props();

	const isDone = $derived(statusKey === 'done');

	// The library keeps the shadow of a dragged card in the source list; it must
	// not count toward the column total.
	const realItems = $derived(items.filter((item) => !item.isDndShadowItem));
	const overLimit = $derived(limit !== undefined && realItems.length > limit);
</script>

<section
	class="group/column flex w-[19rem] shrink-0 flex-col border-l border-[color:var(--surface-divider)] px-3 first:border-l-0 first:pl-0"
	aria-label={label}
	data-board-column={statusKey}
	title={isDone && doneDays !== undefined ? `Issues closed in the last ${doneDays} days` : undefined}
>
	<header class="flex h-8 shrink-0 items-center gap-1.5">
		<StatusIcon status={isDone ? 'done' : statusKey} class="size-4" />
		<span class="text-[13px] font-semibold tracking-tight">{label}</span>
		<span
			class={cn(
				'mono text-muted-foreground text-[13px]',
				overLimit && 'text-warning font-medium'
			)}
			title={limit !== undefined ? `${realItems.length} of ${limit} (WIP limit)` : undefined}
		>
			{realItems.length}{limit !== undefined ? ` / ${limit}` : ''}
		</span>
		{#if !isDone}
			<a
				href="/intake"
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 ml-auto inline-flex size-6 items-center justify-center rounded opacity-100 outline-none transition-opacity focus-visible:ring-1 md:opacity-0 md:group-hover/column:opacity-100 md:group-focus-within/column:opacity-100"
				title="New issue"
				aria-label={`New issue in ${label}`}
			>
				<PlusIcon class="size-3.5" />
			</a>
		{/if}
	</header>

	<div class="relative min-h-0 flex-1">
		<div
			class="flex min-h-full flex-col gap-1.5 overflow-y-auto pt-1 pb-2"
			use:dndzone={{
				items,
				type: 'board',
				flipDurationMs: 150,
				zoneTabIndex: -1,
				zoneItemTabIndex: -1,
				dropTargetClasses: ['bg-white/[0.02]']
			}}
			onconsider={onconsider}
			onfinalize={onfinalize}
		>
			{#each items as item (item.id)}
				<div
					animate:flip={{ duration: 150 }}
					class={item.isDndShadowItem
						? 'bg-[var(--surface-accent)] my-0.5 h-0.5 shrink-0 rounded-full'
						: undefined}
					aria-hidden={item.isDndShadowItem ? 'true' : undefined}
				>
					{#if !item.isDndShadowItem}
						<BoardCard
							issue={item.issue}
							{repoShortcodes}
							{showRepo}
							{viewer}
							tabIndex={item.id === activeKey ? 0 : -1}
						/>
					{/if}
				</div>
			{/each}
		</div>

		{#if items.length === 0}
			<div
				class="text-muted-foreground/60 pointer-events-none absolute inset-0 flex items-start justify-center pt-6 text-xs"
			>
				No issues
			</div>
		{/if}
	</div>
</section>
