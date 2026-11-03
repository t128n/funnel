<script lang="ts">
	import { Table } from '@sveltestrap/sveltestrap';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { barPercent, formatMinutes } from '#lib/planning';
	import type { EpicSummary } from '#lib/server/epics/queries';
	import ProgressBar from './ProgressBar.svelte';

	/**
	 * Epic rows in the order `listEpics` returns them: open before closed.
	 * Progress, estimate, actual and delay are rollups over resolved children.
	 *
	 * The list is page structure, not a card: a dense Bootstrap table with
	 * 2.25 rem rows and right-aligned numerals. The epic cell stacks the mono
	 * reference, title and optional milestone.
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

<div data-testid="epic-list">
	<Table hover responsive size="sm" class="align-middle funnel-table">
		<thead>
			<tr>
				<th scope="col">Epic</th>
				<th scope="col">Status</th>
				<th scope="col" class="text-end">Progress</th>
				<th scope="col" class="text-end">Estimate</th>
				<th scope="col" class="text-end">Actual</th>
				<th scope="col" class="text-end">Delay</th>
			</tr>
		</thead>
		<tbody>
			{#each epics as epic (epic.ref)}
				<tr class="position-relative">
					<td class="min-w-0 py-1">
						<a href={href(epic)} class="d-flex min-w-0 flex-column gap-1 stretched-link text-decoration-none">
							<span class="d-flex min-w-0 align-items-baseline gap-2">
								<span class="font-monospace flex-shrink-0 text-body-secondary">
									{epic.repo}#{epic.number}
								</span>
								<span class="min-w-0 text-truncate text-body">
									{epic.title || 'Untitled epic'}
								</span>
							</span>
							{#if epic.milestone}
								<span class="text-truncate small text-body-secondary">
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
					<td class="text-nowrap">
						<span class="d-flex align-items-center justify-content-end gap-2">
							<span class="num text-body-secondary">
								{epic.closedChildCount} / {epic.childCount}
							</span>
							<ProgressBar value={barPercent(epic.closedChildCount, epic.childCount)} />
						</span>
					</td>
					<td class="font-monospace text-end text-nowrap">{formatMinutes(epic.estimateMinutes)}</td>
					<td class="font-monospace text-end text-nowrap">{formatMinutes(epic.actualMinutes)}</td>
					<td class="font-monospace text-end text-nowrap">{formatMinutes(epic.delayMinutes)}</td>
				</tr>
			{/each}
		</tbody>
	</Table>
</div>

<style>
	.num {
		font-variant-numeric: tabular-nums;
	}
</style>
