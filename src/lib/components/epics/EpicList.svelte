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
	 * A plain Bootstrap table: the reference is an ordinary link, the title is
	 * body text, and numerals are right-aligned.
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
				<th scope="col">Title</th>
				<th scope="col">Milestone</th>
				<th scope="col">Status</th>
				<th scope="col" class="text-end">Progress</th>
				<th scope="col" class="text-end">Estimate</th>
				<th scope="col" class="text-end">Actual</th>
				<th scope="col" class="text-end">Delay</th>
			</tr>
		</thead>
		<tbody>
			{#each epics as epic (epic.ref)}
				<tr>
					<td class="text-nowrap">
						<a
							href={href(epic)}
							class="link-primary link-underline-opacity-0 link-underline-opacity-100-hover"
						>
							{epic.repo}#{epic.number}
						</a>
					</td>
					<td class="min-w-0">
						<span class="d-block text-truncate">{epic.title || 'Untitled epic'}</span>
					</td>
					<td class="small text-body-secondary text-nowrap">
						{#if epic.milestone}
							{epic.milestone.title}
							{#if epic.milestone.dueOn !== null}
								· {dueLabel(epic.milestone.dueOn)}
							{/if}
						{:else}
							—
						{/if}
					</td>
					<td>
						<StatusText status={epic.state === 'closed' ? 'done' : 'open'} state={epic.state} />
					</td>
					<td class="text-end text-nowrap">
						<span class="d-inline-flex align-items-center justify-content-end gap-2">
							<span class="small text-body-secondary">
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
