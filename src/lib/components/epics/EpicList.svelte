<script lang="ts">
	import { barPercent, formatMinutes } from '#lib/planning';
	import type { EpicSummary } from '#lib/server/epics/queries';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	/**
	 * Epic cards in the order `listEpics` returns them: open before closed.
	 * Progress, estimate, actual and delay are rollups over resolved children.
	 */
	interface Props {
		epics: EpicSummary[];
	}

	let { epics }: Props = $props();

	function href(epic: EpicSummary): string {
		const slash = epic.repo.indexOf('/');
		const owner = slash > 0 ? epic.repo.slice(0, slash) : epic.repo;
		const name = slash > 0 ? epic.repo.slice(slash + 1) : '';
		return `/epics/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${epic.number}`;
	}

	function dueLabel(dueOn: number | null): string | null {
		return dueOn === null ? null : new Date(dueOn).toISOString().slice(0, 10);
	}
</script>

<div class="flex flex-col gap-2" data-testid="epic-list">
	{#each epics as epic (epic.ref)}
		<a
			href={href(epic)}
			class="border-[color:var(--surface-divider)] hover:bg-[var(--surface-card-hover)] group flex flex-col gap-2 rounded-lg border p-3 transition-colors"
		>
			<div class="flex min-w-0 items-center gap-2">
				<span class="min-w-0 flex-1 truncate text-sm font-medium">{epic.title || 'Untitled epic'}</span>
				{#if epic.state === 'closed'}
					<span class="text-muted-foreground shrink-0 text-[11px]">closed</span>
				{/if}
				{#if epic.milestone}
					<span class="text-muted-foreground shrink-0 text-[11px]" title="Milestone">
						{epic.milestone.title}
						{#if epic.milestone.dueOn !== null}
							· {dueLabel(epic.milestone.dueOn)}
						{/if}
					</span>
				{/if}
				<ChevronRightIcon
					class="text-muted-foreground size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
				/>
			</div>

			<div class="flex items-center gap-2">
				<span class="text-muted-foreground shrink-0 text-[11px] tabular-nums">
					{epic.repo}#{epic.number}
				</span>
				<span class="bg-[var(--surface-tag-bg)] h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
					<span
						class="block h-full rounded-full bg-[var(--surface-accent)]"
						style={`width: ${barPercent(epic.closedChildCount, epic.childCount)}%`}
					></span>
				</span>
				<span class="text-muted-foreground shrink-0 text-[11px] tabular-nums">
					{epic.closedChildCount}/{epic.childCount}
				</span>
			</div>

			<div class="text-muted-foreground flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
				<span>{formatMinutes(epic.estimateMinutes)} estimate</span>
				<span>{formatMinutes(epic.actualMinutes)} actual</span>
				<span>{formatMinutes(epic.delayMinutes)} delay</span>
			</div>
		</a>
	{/each}
</div>
