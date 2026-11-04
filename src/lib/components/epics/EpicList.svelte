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
	 * A plain Bootstrap table. The title is the primary blue link and the ref is
	 * secondary. Below `md` the table keeps only the title column and folds the
	 * ref, status, milestone and progress into one metadata line; below `lg` the
	 * time columns become a second line, so the page never scrolls sideways.
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

<div class="table-responsive border rounded" data-testid="epic-list">
	<Table hover size="sm" class="align-middle funnel-table funnel-table--fluid mb-0">
		<thead class="table-light small text-body-secondary">
			<tr>
				<th scope="col" class="text-body-secondary d-none d-md-table-cell" style="width: 7rem;">
					Epic
				</th>
				<th scope="col" class="text-body-secondary">Title</th>
				<th scope="col" class="text-body-secondary d-none d-lg-table-cell">Milestone</th>
				<th scope="col" class="text-body-secondary d-none d-md-table-cell" style="width: 7rem;">
					Status
				</th>
				<th scope="col" class="text-body-secondary text-end d-none d-md-table-cell" style="width: 6rem;">
					Progress
				</th>
				<th scope="col" class="text-body-secondary text-end d-none d-lg-table-cell" style="width: 6rem;">
					Estimate
				</th>
				<th scope="col" class="text-body-secondary text-end d-none d-lg-table-cell" style="width: 6rem;">
					Actual
				</th>
				<th scope="col" class="text-body-secondary text-end d-none d-lg-table-cell" style="width: 6rem;">
					Delay
				</th>
			</tr>
		</thead>
		<tbody>
			{#each epics as epic (epic.ref)}
				{@const due = epic.milestone ? dueLabel(epic.milestone.dueOn) : null}
				{@const percent = barPercent(epic.closedChildCount, epic.childCount)}
				<tr>
					<td class="text-nowrap d-none d-md-table-cell">
						<a
							href={href(epic)}
							class="link-primary link-underline-opacity-0 link-underline-opacity-100-hover"
						>
							{epic.repo}#{epic.number}
						</a>
					</td>
					<td class="min-w-0">
						<a
							href={href(epic)}
							class="text-primary text-decoration-none text-break"
						>
							{epic.title || 'Untitled epic'}
						</a>
						<div class="small text-body-secondary d-md-none mt-1 text-break">
							<a
								href={href(epic)}
								class="link-primary link-underline-opacity-0 link-underline-opacity-100-hover font-monospace"
							>
								{epic.repo}#{epic.number}
							</a>
							<span class="mx-1" aria-hidden="true">·</span>
							<StatusText status={epic.state === 'closed' ? 'done' : 'open'} state={epic.state} />
							<span class="mx-1" aria-hidden="true">·</span>
							<span class="d-inline-flex align-items-center gap-1">
								<span>{epic.closedChildCount} / {epic.childCount}</span>
								<ProgressBar value={percent} />
							</span>
						</div>
						<div class="small text-body-secondary d-none d-md-block d-lg-none mt-1 text-break">
							{#if epic.milestone}
								<span>{epic.milestone.title}{#if due} · due {due}{/if}</span>
							{:else}
								<span>No milestone</span>
							{/if}
						</div>
						<div class="small text-body-secondary d-lg-none mt-1 d-flex flex-wrap column-gap-3 text-break">
							<span>Estimate {formatMinutes(epic.estimateMinutes)}</span>
							<span>Actual {formatMinutes(epic.actualMinutes)}</span>
							<span>Delay {formatMinutes(epic.delayMinutes)}</span>
						</div>
					</td>
					<td class="small text-body-secondary text-nowrap d-none d-lg-table-cell">
						{#if epic.milestone}
							{epic.milestone.title}
							{#if due}
								· {due}
							{/if}
						{:else}
							—
						{/if}
					</td>
					<td class="d-none d-md-table-cell">
						<StatusText status={epic.state === 'closed' ? 'done' : 'open'} state={epic.state} />
					</td>
					<td class="text-end text-nowrap d-none d-md-table-cell">
						<span class="d-inline-flex align-items-center justify-content-end gap-2">
							<span class="small text-body-secondary">
								{epic.closedChildCount} / {epic.childCount}
							</span>
							<ProgressBar value={percent} />
						</span>
					</td>
					<td class="font-monospace text-end text-nowrap d-none d-lg-table-cell">
						{formatMinutes(epic.estimateMinutes)}
					</td>
					<td class="font-monospace text-end text-nowrap d-none d-lg-table-cell">
						{formatMinutes(epic.actualMinutes)}
					</td>
					<td class="font-monospace text-end text-nowrap d-none d-lg-table-cell">
						{formatMinutes(epic.delayMinutes)}
					</td>
				</tr>
			{/each}
		</tbody>
	</Table>
</div>
