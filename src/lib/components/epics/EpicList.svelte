<script lang="ts">
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { barPercent, formatMinutes } from '#lib/planning';
	import type { EpicSummary } from '#lib/server/epics/queries';
	import ProgressBar from './ProgressBar.svelte';

	/**
	 * Epic rows in the order `listEpics` returns them: open before closed.
	 * Progress, estimate, actual and delay are rollups over resolved children.
	 *
	 * The list is page structure, not a card: a ruled table with a `surface-2`
	 * header, 2.25 rem rows and right-aligned numerals. The epic cell stacks the
	 * mono reference, title and optional milestone.
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

<div class="overflow-x-auto" data-testid="epic-list">
	<table class="data-table">
		<thead>
			<tr>
				<th>Epic</th>
				<th>Status</th>
				<th class="text-end">Progress</th>
				<th class="text-end">Estimate</th>
				<th class="text-end">Actual</th>
				<th class="text-end">Delay</th>
			</tr>
		</thead>
		<tbody>
			{#each epics as epic (epic.ref)}
				<tr class="relative">
					<td class="min-w-0 py-1">
						<a href={href(epic)} class="flex min-w-0 flex-col gap-0.5 after:absolute after:inset-0 after:content-['']">
							<span class="flex min-w-0 items-baseline gap-2">
								<span class="mono shrink-0 text-fg-secondary">
									{epic.repo}#{epic.number}
								</span>
								<span class="min-w-0 truncate text-body text-fg">
									{epic.title || 'Untitled epic'}
								</span>
							</span>
							{#if epic.milestone}
								<span class="truncate text-caption text-fg-secondary">
									{epic.milestone.title}
									{#if epic.milestone.dueOn !== null}
										· {dueLabel(epic.milestone.dueOn)}
									{/if}
								</span>
							{/if}
						</a>
					</td>
					<td>
						<StatusText status={epic.state === 'closed' ? 'done' : 'open'} state={epic.state} />
					</td>
					<td class="whitespace-nowrap">
						<span class="flex items-center justify-end gap-2">
							<span class="tabular-nums text-body text-fg-secondary">
								{epic.closedChildCount} / {epic.childCount}
							</span>
							<ProgressBar
								value={barPercent(epic.closedChildCount, epic.childCount)}
								class="w-10"
							/>
						</span>
					</td>
					<td class="mono text-end whitespace-nowrap">{formatMinutes(epic.estimateMinutes)}</td>
					<td class="mono text-end whitespace-nowrap">{formatMinutes(epic.actualMinutes)}</td>
					<td class="mono text-end whitespace-nowrap">{formatMinutes(epic.delayMinutes)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
