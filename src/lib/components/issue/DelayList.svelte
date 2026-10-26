<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/primitives/button';
	import type { DelayItem } from '#lib/server/actuals/store';
	import { absoluteTime } from '#lib/time';
	import { cn } from '#lib/utils';
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
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<h2 class="text-foreground text-sm font-semibold">Delays</h2>
			<span class="mono text-muted-foreground text-xs">{delays.length}</span>
		</div>
		{#if mayWrite}
			<Button variant="ghost" size="xs" onclick={onrecord}>Record delay</Button>
		{/if}
	</div>

	{#if delays.length === 0}
		<div
			class="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-xs"
		>
			No delays recorded.
		</div>
	{:else}
		<ul class="flex flex-col gap-1.5">
			{#each delays as row (row.id)}
				<li
					class={cn(
						'border-border flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs',
						row.source === 'blocked' && 'bg-destructive/5'
					)}
				>
					<div class="flex min-w-0 items-center gap-2">
						<span class="text-foreground font-medium">{delayReasonLabel(row.reason)}</span>
						<span
							class={cn(
								'mono rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
								row.source === 'blocked'
									? 'bg-destructive/10 text-destructive'
									: 'bg-accent text-muted-foreground'
							)}
						>
							{row.source === 'blocked' ? 'Blocked' : 'Manual'}
						</span>
						<span class="mono text-muted-foreground ml-auto">{delayDuration(row)}</span>
					</div>
					<div class="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
						<span title={absoluteTime(row.startedAt)}>
							{absoluteTime(row.startedAt)}
						</span>
						<span aria-hidden="true">→</span>
						<span>
							{row.endedAt === null ? 'ongoing' : absoluteTime(row.endedAt)}
						</span>
					</div>
					{#if row.note.trim().length > 0}
						<p class="text-foreground">{row.note}</p>
					{/if}
					{#if canCloseDelay(row, mayWrite) || canDeleteDelay(row, mayWrite)}
						<div class="mt-0.5 flex items-center gap-1">
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
		<p class="text-muted-foreground text-[11px]">
			Blocked delays follow the blocked flag and are read-only.
		</p>
	{/if}
	{#if error}
		<p class="text-destructive text-xs" role="alert">{error}</p>
	{/if}
</section>
