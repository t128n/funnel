<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Badge, Button } from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import type { DelayItem } from '#lib/server/actuals/store';
	import { absoluteTime } from '#lib/time';
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

<section class="d-flex flex-column gap-2" aria-label="Delays">
	<div class="d-flex align-items-center justify-content-between gap-3 border-top pt-3">
		<div class="d-flex align-items-baseline gap-2">
			<h2 class="h5 fw-semibold mb-0">Delays</h2>
			<span class="small text-body-secondary delay-number">{delays.length}</span>
		</div>
		{#if mayWrite}
			<Button color="link" size="sm" class="text-decoration-none px-0 py-0" onclick={onrecord}>
				Record delay
			</Button>
		{/if}
	</div>

	{#if delays.length === 0}
		<p class="text-body-secondary mb-0">No delays recorded.</p>
	{:else}
		<ul class="list-unstyled mb-0">
			{#each delays as row (row.id)}
				<li class="delay-row d-flex flex-column gap-1 border-top py-2">
					<div class="d-flex min-w-0 flex-wrap align-items-center gap-2">
						<span class="fw-semibold">{delayReasonLabel(row.reason)}</span>
						{#if row.source === 'blocked'}
							<Badge color="danger" class="d-inline-flex align-items-center gap-1">
								<i class="bi bi-slash-circle" aria-hidden="true"></i>
								Blocked
							</Badge>
						{:else}
							<Badge color="secondary" class="d-inline-flex align-items-center gap-1">
								<i class="bi bi-clock" aria-hidden="true"></i>
								Manual
							</Badge>
						{/if}
						<span class="ms-auto small text-body-secondary delay-number">
							{delayDuration(row)}
						</span>
					</div>
					<div class="d-flex min-w-0 flex-wrap align-items-center gap-2 small text-body-secondary">
						<span title={absoluteTime(row.startedAt)}>
							{absoluteTime(row.startedAt)}
						</span>
						<span aria-hidden="true">→</span>
						<span>
							{row.endedAt === null ? 'Ongoing' : absoluteTime(row.endedAt)}
						</span>
					</div>
					{#if row.note.trim().length > 0}
						<p class="mb-0">{row.note}</p>
					{/if}
					{#if canCloseDelay(row, mayWrite) || canDeleteDelay(row, mayWrite)}
						<div class="d-flex align-items-center gap-1">
							{#if canCloseDelay(row, mayWrite)}
								<Button
									color="link"
									size="sm"
									class="text-decoration-none px-1 py-0"
									disabled={busyId === row.id}
									onclick={() => close(row)}
								>
									Close
								</Button>
							{/if}
							{#if canDeleteDelay(row, mayWrite)}
								<Button
									color="link"
									size="sm"
									class="text-decoration-none px-1 py-0 text-body-secondary"
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
		<p class="small text-body-tertiary mb-0">
			Blocked delays follow the blocked flag and are read-only.
		</p>
	{/if}
	{#if error}
		<InlineStatus tone="error" message={error} />
	{/if}
</section>

<style>
	.delay-row:first-child {
		border-top: 0 !important;
	}

	.delay-number {
		font-variant-numeric: tabular-nums;
	}
</style>
