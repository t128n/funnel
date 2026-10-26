<script module lang="ts">
	/**
	 * `HH:MM–HH:MM` for a block's left column. Pure so the day grid's time
	 * range can be tested without mounting the component.
	 */
	export function planBlockLabel(start: number, end: number): string {
		const clock = (minute: number): string => {
			const total = Math.max(0, Math.round(minute));
			return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
		};
		return `${clock(start)}–${clock(end)}`;
	}
</script>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Empty from '#lib/components/primitives/empty';
	import { Button } from '#lib/components/primitives/button';
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
		/**
		 * Day planning is personal state, so the parent enables this for any
		 * signed-in viewer — not just the workspace `write` role.
		 */
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
			<h2 class="text-base font-semibold">{view.label}</h2>
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

	<div
		class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-y border-[color:var(--border)] py-1.5 text-xs"
		aria-label="ALPEN summary"
	>
		<span data-alpen="A" title="Aufgaben" class="flex items-baseline gap-1">
			<span class="flag flag-muted">A</span>
			<span>{view.candidates.length} candidates</span>
		</span>
		<span data-alpen="L" title="Länge" class="flex items-baseline gap-1">
			<span class="flag flag-muted">L</span>
			<span class="tabular-nums">{formatMinutes(view.plannedMinutes)}</span>
		</span>
		<span data-alpen="P" title="Puffer" class="flex items-baseline gap-1">
			<span class="flag flag-muted">P</span>
			<span class="tabular-nums">{formatMinutes(view.bufferMinutes)}</span>
		</span>
		<span data-alpen="E" title="Entscheiden" class="flex items-baseline gap-1">
			<span class="flag flag-muted">E</span>
			<span>priority order</span>
		</span>
		<span data-alpen="N" title="Nachkontrolle" class="flex items-baseline gap-1">
			<span class="flag flag-muted">N</span>
			<span class="tabular-nums">{signed(view.review.varianceMinutes)}</span>
		</span>
	</div>

	{#if view.availableMinutes === 0}
		<p class="text-muted-foreground border border-[color:var(--border)] p-3 text-xs">
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
			<h3 class="bug-table-head text-muted-foreground">Day grid</h3>
			{#if view.blocks.length === 0}
				<Empty.Root class="border-0 py-6">
					<Empty.Description>No blocks yet. Auto-plan or add a candidate.</Empty.Description>
				</Empty.Root>
			{/if}
			<div
				class="relative overflow-hidden border border-[color:var(--border)]"
				style={`height: ${view.endMinute - view.startMinute}px`}
			>
				{#each hourMarks as minute (minute)}
					<div
						class="text-muted-foreground absolute inset-x-0 border-t border-[color:var(--border)] text-2xs"
						style={`top: ${minute - view.startMinute}px`}
					>
						<span class="mono ps-1">{formatClock(minute)}</span>
					</div>
				{/each}

				{#each view.blocks as block (block.id)}
					<div
						class="bg-background absolute inset-x-0 overflow-hidden border border-[color:var(--border)] px-2 py-1"
						style={`top: ${block.startMinute - view.startMinute}px; height: ${block.minutes}px;`}
						data-block={block.id}
					>
						<div class="flex min-w-0 items-baseline gap-2 leading-tight">
							<span class="mono text-muted-foreground shrink-0 text-2xs">
								{planBlockLabel(block.startMinute, block.startMinute + block.minutes)}
							</span>
							<span class="min-w-0 flex-1 truncate text-sm">
								{block.kind === 'issue'
									? `${block.org}/${block.name}#${block.issueNumber}`
									: 'Buffer'}
							</span>
							<span class="flag flag-muted shrink-0">{formatMinutes(block.minutes)}</span>
						</div>
						{#if mayWrite}
							<div class="mt-0.5 flex items-center gap-1">
								<input
									type="time"
									class="border-input bg-background mono h-5 rounded-none border px-1 text-2xs"
									value={formatClock(block.startMinute)}
									aria-label={`Start time for ${block.kind === 'issue' ? `${block.org}/${block.name}#${block.issueNumber}` : 'buffer'}`}
									onchange={(event) => editStart(block, event.currentTarget.value)}
								/>
								<button
									type="button"
									class="text-muted-foreground hover:text-foreground ms-auto text-2xs"
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
			<h3 class="bug-table-head text-muted-foreground">Candidates</h3>
			{#if view.candidates.length === 0}
				<Empty.Root class="border-0 py-6">
					<Empty.Description>No open, sized issues in this week.</Empty.Description>
				</Empty.Root>
			{:else}
				<ul class="flex flex-col border-t border-[color:var(--border)]">
					{#each view.candidates as candidate (`${candidate.org}/${candidate.name}#${candidate.issueNumber}`)}
						<li
							class="flex items-center gap-2 border-b border-[color:var(--border)] px-1 py-1.5 last:border-b-0"
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm">{candidate.title}</p>
								<p class="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-2xs">
									<span class="mono tabular-nums">
										{candidate.org}/{candidate.name}#{candidate.issueNumber}
									</span>
									{#if candidate.priority}
										<span class="flag flag-muted">{candidate.priority}</span>
									{/if}
									<span class="flag flag-muted">{formatMinutes(candidate.minutes)}</span>
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
		<h3 class="bug-table-head text-muted-foreground">Nachkontrolle</h3>
		{#if view.review.rows.length === 0}
			<Empty.Root class="border-0 py-4">
				<Empty.Description>Add an issue block to compare planned and actual time.</Empty.Description>
			</Empty.Root>
		{:else}
			<ul class="flex flex-col border-t border-[color:var(--border)]">
				{#each view.review.rows as row (row.key)}
					<li
						class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[color:var(--border)] px-1 py-1.5 text-sm last:border-b-0"
					>
						<span class="mono min-w-0 flex-1 truncate">{row.key}</span>
						<span class="text-muted-foreground text-xs tabular-nums">
							planned {formatMinutes(row.plannedMinutes)} · actual
							{formatMinutes(row.actualMinutes)}
						</span>
						<span
							class="flag tabular-nums {row.varianceMinutes > 0
								? 'flag-danger'
								: 'flag-muted'}"
						>
							{signed(row.varianceMinutes)}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>
