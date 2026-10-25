<script lang="ts">
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import type { EpicChild } from '#lib/server/epics/queries';

	/**
	 * The ordered child table. Missing children stay visible as unavailable
	 * placeholders so a written ref never silently disappears from the epic.
	 * Writers get a remove control; readers see the same rows without one.
	 *
	 * Rendered as a Bugzilla result table: 11px uppercase header on `--muted`,
	 * 1px row rules and zebra stripes. Times are mono, right-aligned text.
	 */
	interface Props {
		children: EpicChild[];
		mayWrite?: boolean;
		onremove?: (ref: string) => void;
		removing?: string | null;
	}

	let { children, mayWrite = false, onremove, removing = null }: Props = $props();

	function statusLabel(status: string | null): string {
		return status ?? 'untriaged';
	}

	function statusClass(status: string | null): string {
		if (status === 'done') return 'flag-success';
		if (status === 'in-progress' || status === 'in-review') return 'flag-warning';
		return 'flag-muted';
	}
</script>

<div class="overflow-x-auto border border-border" data-testid="epic-children">
	{#if children.length === 0}
		<p class="text-muted-foreground px-2 py-4 text-xs">
			No children yet. Add open issues from this page.
		</p>
	{:else}
		<table class="bug-table">
			<thead>
				<tr>
					<th>Issue</th>
					<th>Status</th>
					<th class="text-end">Estimate</th>
					<th class="text-end">Actual</th>
					<th class="text-end">Delay</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each children as child (child.ref)}
					<tr>
						<td>
							{#if child.available}
								<a
									href={issuePath('issues', child.repo, child.number)}
									class="link flex min-w-0 items-center gap-2"
								>
									<span class="mono text-muted-foreground shrink-0 text-xs">
										{child.repo}#{child.number}
									</span>
									<span
										class="min-w-0 truncate text-sm"
										class:line-through={child.state === 'closed'}
									>
										{child.title || 'Untitled issue'}
									</span>
								</a>
							{:else}
								<span class="text-muted-foreground flex min-w-0 items-center gap-2" title="Not mirrored">
									<span class="mono shrink-0 text-xs">{child.ref}</span>
									<span class="truncate text-sm italic">unavailable</span>
								</span>
							{/if}
						</td>
						<td>
							<span class={child.available ? `flag ${statusClass(child.status)}` : 'flag flag-muted'}>
								{child.available ? statusLabel(child.status) : '—'}
							</span>
						</td>
						<td class="mono text-end whitespace-nowrap">
							{child.available ? formatMinutes(child.estimateMinutes) : '—'}
						</td>
						<td class="mono text-end whitespace-nowrap">
							{child.available ? formatMinutes(child.actualMinutes) : '—'}
						</td>
						<td class="mono text-end whitespace-nowrap">
							{child.available ? formatMinutes(child.delayMinutes) : '—'}
						</td>
						<td class="text-end">
							{#if mayWrite && onremove}
								<button
									type="button"
									class="link text-xs disabled:opacity-50"
									disabled={removing === child.ref}
									title="Remove from epic"
									aria-label={`Remove ${child.ref} from the epic`}
									onclick={() => onremove?.(child.ref)}
								>
									remove
								</button>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.bug-table thead th.text-end {
		text-align: right;
	}
</style>
