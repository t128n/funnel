<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Empty from '#lib/components/ui/empty';
	import { Button } from '#lib/components/ui/button';
	import { formatMinutes } from '#lib/planning';
	import type { DayBlockInput, DayCandidate } from '#lib/planning/day-plan';
	import { formatClock, parseClock } from '#lib/time/zoned';
	import type { DayView } from '#/routes/(app)/plan/+page.server';
	import {
		autoPlanRequest,
		dayErrorMessage,
		saveDayRequest,
		type DayRequest
	} from './day-plan-request';

	/**
	 * The ALPEN day view (SPEC §9): a timed grid over the saved blocks, the
	 * candidate list, the five ALPEN readouts and the planned-vs-actual review.
	 * Every mutation replaces the whole day through the personal API and then
	 * re-runs the load, so the grid never drifts from stored state.
	 */
	interface Props {
		view: DayView;
		/** Readers can look; writers can plan, edit and clear. */
		mayWrite?: boolean;
	}

	let { view, mayWrite = false }: Props = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);

	const hourMarks = $derived.by(() => {
		const marks: number[] = [];
		for (let minute = view.startMinute; minute < view.endMinute; minute += 60) {
			marks.push(minute);
		}
		return marks;
	});

	const overbooked = $derived(
		view.plannedMinutes + view.bufferPlannedMinutes > view.availableMinutes
	);
	const outsideHours = $derived(
		view.blocks.some(
			(block) =>
				block.startMinute < view.startMinute ||
				block.startMinute + block.minutes > view.endMinute
		)
	);

	function signed(minutes: number): string {
		if (minutes === 0) return '0m';
		return minutes > 0
			? `+${formatMinutes(minutes)}`
			: `−${formatMinutes(Math.abs(minutes))}`;
	}

	/** Drop the stored id/date before sending a block back to the API. */
	async function send(request: DayRequest): Promise<void> {
		busy = true;
		error = null;
		try {
			const response = await fetch(request.url, {
				method: request.method,
				headers: { 'Content-Type': 'application/json' },
				body: request.body
			});
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as unknown;
				error = dayErrorMessage(response.status, payload);
				return;
			}
			await invalidateAll();
		} catch {
			error = 'The day plan could not be saved. Check your connection.';
		} finally {
			busy = false;
		}
	}

	async function save(blocks: readonly DayBlockInput[]): Promise<void> {
		await send(saveDayRequest(view.date, blocks));
	}

	async function autoPlan(): Promise<void> {
		await send(autoPlanRequest(view.date));
	}

	async function clearDay(): Promise<void> {
		await save([]);
	}

	async function removeBlock(id: string): Promise<void> {
		await save(view.blocks.filter((block) => block.id !== id));
	}

	async function editStart(block: DayBlockInput & { id: string }, value: string): Promise<void> {
		const minute = parseClock(value);
		if (minute === null) return;
		await save(
			view.blocks.map((current) =>
				current.id === block.id ? { ...current, startMinute: minute } : current
			)
		);
	}

	/** First free minute in the work window that fits `minutes`. */
	function firstFreeMinute(minutes: number): number {
		let cursor = view.startMinute;
		const sorted = [...view.blocks].sort((a, b) => a.startMinute - b.startMinute);
		for (const block of sorted) {
			if (block.startMinute - cursor >= minutes) break;
			cursor = Math.max(cursor, block.startMinute + block.minutes);
		}
		return cursor + minutes <= view.endMinute ? cursor : view.startMinute;
	}

	async function addCandidate(candidate: DayCandidate): Promise<void> {
		await save([
			...view.blocks,
			{
				startMinute: firstFreeMinute(candidate.minutes),
				minutes: candidate.minutes,
				kind: 'issue',
				org: candidate.org,
				name: candidate.name,
				issueNumber: candidate.issueNumber
			}
		]);
	}
</script>

<section class="flex flex-col gap-4" data-testid="day-plan" data-day={view.date}>
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-0.5">
			<h2 class="text-sm font-medium">{view.label}</h2>
			<p class="text-muted-foreground text-xs tabular-nums">
				{formatMinutes(view.availableMinutes)} available · {formatMinutes(view.plannedMinutes)} planned ·
				{formatMinutes(view.bufferMinutes)} buffer reserved
			</p>
		</div>

		{#if mayWrite}
			<div class="flex flex-wrap items-center gap-2">
				<Button size="sm" onclick={autoPlan} disabled={busy}>Auto-plan</Button>
				<Button variant="outline" size="sm" onclick={clearDay} disabled={busy}>Clear day</Button>
				<Button variant="ghost" size="sm" href="/settings/availability">
					Working hours
				</Button>
			</div>
		{/if}
	</header>

	{#if error}
		<p class="text-destructive text-xs" role="alert">{error}</p>
	{/if}

	<div class="flex flex-wrap gap-2" aria-label="ALPEN summary">
		<span data-alpen="A" title="Aufgaben" class="rounded-full border px-2.5 py-1 text-[11px]">
			A · {view.candidates.length} candidates
		</span>
		<span data-alpen="L" title="Länge" class="rounded-full border px-2.5 py-1 text-[11px]">
			L · {formatMinutes(view.plannedMinutes)}
		</span>
		<span data-alpen="P" title="Puffer" class="rounded-full border px-2.5 py-1 text-[11px]">
			P · {formatMinutes(view.bufferMinutes)}
		</span>
		<span data-alpen="E" title="Entscheiden" class="rounded-full border px-2.5 py-1 text-[11px]">
			E · priority order
		</span>
		<span data-alpen="N" title="Nachkontrolle" class="rounded-full border px-2.5 py-1 text-[11px] tabular-nums">
			N · {signed(view.review.varianceMinutes)}
		</span>
	</div>

	{#if view.availableMinutes === 0}
		<p class="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
			Not a work day. You can still place blocks manually, but auto-plan produces nothing.
		</p>
	{/if}
	{#if overbooked}
		<p class="text-destructive text-xs" role="status">
			Overbooked by {formatMinutes(view.plannedMinutes + view.bufferPlannedMinutes - view.availableMinutes)}.
		</p>
	{/if}
	{#if outsideHours}
		<p class="text-muted-foreground text-xs">
			Some blocks fall outside working hours. Manual plans may overrun; auto-plan does not.
		</p>
	{/if}

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
		<div class="flex flex-col gap-2">
			<h3 class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">Day grid</h3>
			{#if view.blocks.length === 0}
				<Empty.Root class="border-0 py-6">
					<Empty.Description>No blocks yet. Auto-plan or add a candidate.</Empty.Description>
				</Empty.Root>
			{/if}
			<div
				class="border-[color:var(--surface-divider)] relative overflow-hidden rounded-lg border"
				style={`height: ${view.endMinute - view.startMinute}px`}
			>
				{#each hourMarks as minute (minute)}
					<div
						class="border-[color:var(--surface-divider)] text-muted-foreground absolute inset-x-0 border-t text-[10px]"
						style={`top: ${minute - view.startMinute}px`}
					>
						<span class="ps-1">{formatClock(minute)}</span>
					</div>
				{/each}

				{#each view.blocks as block (block.id)}
					<div
						class="absolute inset-x-1 rounded-md px-1.5 py-0.5 text-[10px] {block.kind === 'buffer'
							? 'bg-muted/70 border border-dashed'
							: 'bg-[var(--surface-tag-bg)] border'}"
						style={`top: ${block.startMinute - view.startMinute}px; height: ${block.minutes}px;`}
						data-block={block.id}
					>
						<div class="flex items-center justify-between gap-2">
							<span class="truncate">
								{block.kind === 'issue'
									? `${block.org}/${block.name}#${block.issueNumber}`
									: 'Buffer'}
							</span>
							<span class="text-muted-foreground shrink-0 tabular-nums">
								{formatMinutes(block.minutes)}
							</span>
						</div>
						{#if mayWrite}
							<div class="mt-0.5 flex items-center gap-1">
								<input
									type="time"
									class="border-input bg-background h-5 rounded border px-0.5 text-[9px]"
									value={formatClock(block.startMinute)}
									aria-label={`Start time for ${block.kind === 'issue' ? `${block.org}/${block.name}#${block.issueNumber}` : 'buffer'}`}
									onchange={(event) => editStart(block, event.currentTarget.value)}
								/>
								<button
									type="button"
									class="text-muted-foreground hover:text-foreground ms-auto text-[9px]"
									onclick={() => removeBlock(block.id)}
								>
									Remove
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<aside class="flex flex-col gap-2" aria-label="Day candidates">
			<h3 class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
				Candidates
			</h3>
			{#if view.candidates.length === 0}
				<Empty.Root class="border-0 py-6">
					<Empty.Description>No open, sized issues in this week.</Empty.Description>
				</Empty.Root>
			{:else}
				<ul class="flex flex-col divide-y divide-[color:var(--surface-divider)]">
					{#each view.candidates as candidate (`${candidate.org}/${candidate.name}#${candidate.issueNumber}`)}
						<li class="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
							<div class="min-w-0 flex-1">
								<p class="truncate text-xs">{candidate.title}</p>
								<p class="text-muted-foreground text-[10px] tabular-nums">
									{candidate.org}/{candidate.name}#{candidate.issueNumber} · {candidate.priority ?? '—'} ·
									{formatMinutes(candidate.minutes)}
								</p>
							</div>
							{#if mayWrite}
								<Button variant="outline" size="sm" onclick={() => addCandidate(candidate)} disabled={busy}>
									Add
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	</div>

	<section class="flex flex-col gap-2" aria-label="Planned versus actual">
		<h3 class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
			Nachkontrolle
		</h3>
		{#if view.review.rows.length === 0}
			<Empty.Root class="border-0 py-4">
				<Empty.Description>Add an issue block to compare planned and actual time.</Empty.Description>
			</Empty.Root>
		{:else}
			<ul class="flex flex-col divide-y divide-[color:var(--surface-divider)]">
				{#each view.review.rows as row (row.key)}
					<li class="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-xs">
						<span class="min-w-0 flex-1 truncate">{row.key}</span>
						<span class="text-muted-foreground tabular-nums">
							planned {formatMinutes(row.plannedMinutes)} · actual
							{formatMinutes(row.actualMinutes)}
						</span>
						<span
							class="tabular-nums {row.varianceMinutes > 0
								? 'text-destructive'
								: 'text-muted-foreground'}"
						>
							{signed(row.varianceMinutes)}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>
