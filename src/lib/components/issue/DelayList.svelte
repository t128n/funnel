<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import { Button } from '#lib/components/ui/button';
	import type { DelayItem } from '#lib/server/actuals/store';
	import { absoluteTime } from '#lib/time';
	import BanIcon from '@lucide/svelte/icons/ban';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import {
		canCloseDelay,
		canDeleteDelay,
		delayDuration,
		delayReasonLabel,
		splitDelays
	} from './inspector-format';

	/**
	 * The Inspector's delay rows (SPEC §2, §5). Automatic delays follow the
	 * blocked flag and are read-only; manual rows can be closed or deleted by
	 * writers. Writes invalidate the page data so rollups refresh.
	 */
	interface Props {
		delays: DelayItem[];
		repo: string;
		number: number;
		mayWrite: boolean;
		onrecord: () => void;
	}

	let { delays, repo, number, mayWrite, onrecord }: Props = $props();

	const grouped = $derived(splitDelays(delays));

	let busyId = $state<string | null>(null);
	let error = $state<string | null>(null);

	function apiBase(): string {
		const slash = repo.indexOf('/');
		const owner = slash > 0 ? repo.slice(0, slash) : repo;
		const name = slash > 0 ? repo.slice(slash + 1) : '';
		return `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}/delays`;
	}

	async function mutateDelay(
		delay: DelayItem,
		method: 'PATCH' | 'DELETE',
		body?: Record<string, unknown>
	): Promise<void> {
		if (busyId) return;
		busyId = delay.id;
		error = null;
		try {
			const response = await fetch(`${apiBase()}/${encodeURIComponent(delay.id)}`, {
				method,
				headers: body ? { 'Content-Type': 'application/json' } : undefined,
				body: body ? JSON.stringify(body) : undefined
			});
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				error = payload?.message ?? 'Could not update the delay.';
				return;
			}
			await invalidateAll();
		} catch {
			error = 'Could not reach the server. Check the connection and try again.';
		} finally {
			busyId = null;
		}
	}

	function close(row: DelayItem): void {
		void mutateDelay(row, 'PATCH', { ended_at: new Date().toISOString() });
	}

	function remove(row: DelayItem): void {
		void mutateDelay(row, 'DELETE');
	}
</script>

<section class="flex flex-col gap-2" aria-label="Delays">
	<div class="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
		<div class="flex items-baseline gap-2">
			<h2 class="text-heading-sm font-semibold text-fg">Delays</h2>
			<span class="text-caption tabular-nums text-fg-secondary">{delays.length}</span>
		</div>
		{#if mayWrite}
			<Button variant="ghost" size="xs" onclick={onrecord}>Record delay</Button>
		{/if}
	</div>

	{#if delays.length === 0}
		<p class="text-body text-fg-secondary">No delays recorded.</p>
	{:else}
		<ul class="flex flex-col">
			{#each delays as row (row.id)}
				<li class="flex flex-col gap-1 border-t border-border-subtle py-2 text-body first:border-t-0">
					<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
						<span class="font-semibold text-fg">{delayReasonLabel(row.reason)}</span>
						<span
							class={row.source === 'blocked'
								? 'status status-error'
								: 'status status-muted'}
						>
							{#if row.source === 'blocked'}
								<BanIcon aria-hidden="true" />
								Blocked
							{:else}
								<ClockIcon aria-hidden="true" />
								Manual
							{/if}
						</span>
						<span class="ml-auto text-caption tabular-nums text-fg-secondary">
							{delayDuration(row)}
						</span>
					</div>
					<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-secondary">
						<span title={absoluteTime(row.startedAt)}>
							{absoluteTime(row.startedAt)}
						</span>
						<span aria-hidden="true">→</span>
						<span>
							{row.endedAt === null ? 'Ongoing' : absoluteTime(row.endedAt)}
						</span>
					</div>
					{#if row.note.trim().length > 0}
						<p class="text-body text-fg">{row.note}</p>
					{/if}
					{#if canCloseDelay(row, mayWrite) || canDeleteDelay(row, mayWrite)}
						<div class="flex items-center gap-1">
							{#if canCloseDelay(row, mayWrite)}
								<Button
									variant="ghost"
									size="xs"
									disabled={busyId === row.id}
									onclick={() => close(row)}
								>
									Close
								</Button>
							{/if}
							{#if canDeleteDelay(row, mayWrite)}
								<Button
									variant="ghost"
									size="xs"
									disabled={busyId === row.id}
									onclick={() => remove(row)}
								>
									Delete
								</Button>
							{/if}
							{#if busyId === row.id}
								<Spinner size={12} />
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if grouped.automatic.length > 0 && mayWrite}
		<p class="text-caption text-fg-muted">
			Blocked delays follow the blocked flag and are read-only.
		</p>
	{/if}
	{#if error}
		<InlineStatus tone="error" message={error} />
	{/if}
</section>
