<script lang="ts">
	import { barPercent, formatMinutes } from '#lib/planning';
	import type { EpicSummary } from '#lib/server/epics/queries';

	/**
	 * Epic rows in the order `listEpics` returns them: open before closed.
	 * Progress, estimate, actual and delay are rollups over resolved children.
	 *
	 * Each row is a Bugzilla result-table row: mono reference, 13px title,
	 * `.flag` state and plain mono numbers. Zebra stripes and 1px rules replace
	 * the old card border, radius and hover lift.
	 */
	interface Props {
		epics: EpicSummary[];
	}

	let { epics }: Props = $props();

	const GRID = 'grid grid-cols-[minmax(0,1fr)_5rem_4rem_4.5rem_4.5rem_4.5rem] items-center gap-2';

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

<div class="border border-border" data-testid="epic-list">
	<div class={`bug-table-head ${GRID}`} aria-hidden="true">
		<span>Epic</span>
		<span>Status</span>
		<span class="text-end">Progress</span>
		<span class="text-end">Estimate</span>
		<span class="text-end">Actual</span>
		<span class="text-end">Delay</span>
	</div>

	{#each epics as epic (epic.ref)}
		<a href={href(epic)} class={`epic-row group/row border-b border-border px-2 py-1.5 last:border-b-0 ${GRID}`}>
			<span class="flex min-w-0 flex-col">
				<span class="min-w-0 truncate text-sm">
					<span class="mono text-muted-foreground me-2 text-xs">{epic.repo}#{epic.number}</span>
					<span class="text-foreground">{epic.title || 'Untitled epic'}</span>
				</span>
				{#if epic.milestone}
					<span class="text-muted-foreground truncate text-xs" title="Milestone">
						{epic.milestone.title}
						{#if epic.milestone.dueOn !== null}
							· {dueLabel(epic.milestone.dueOn)}
						{/if}
					</span>
				{/if}
			</span>

			<span class={epic.state === 'closed' ? 'flag flag-muted' : 'flag flag-warning'}>
				{epic.state === 'closed' ? 'closed' : 'open'}
			</span>

			<span
				class="mono text-muted-foreground text-end text-xs whitespace-nowrap"
				title={`${barPercent(epic.closedChildCount, epic.childCount)}% complete`}
			>
				{epic.closedChildCount}/{epic.childCount}
			</span>
			<span class="mono text-end text-xs whitespace-nowrap">
				{formatMinutes(epic.estimateMinutes)}
			</span>
			<span class="mono text-end text-xs whitespace-nowrap">
				{formatMinutes(epic.actualMinutes)}
			</span>
			<span class="mono text-end text-xs whitespace-nowrap">
				{formatMinutes(epic.delayMinutes)}
			</span>
		</a>
	{/each}
</div>

<style>
	.epic-row {
		color: var(--foreground);
		transition: background-color 120ms;
	}

	.epic-row:nth-of-type(even) {
		background: color-mix(in srgb, var(--muted) 45%, transparent);
	}

	.epic-row:hover,
	.epic-row:nth-of-type(even):hover {
		background: var(--accent);
	}
</style>
