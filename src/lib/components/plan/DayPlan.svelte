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
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import { formatMinutes } from '#lib/planning';
	import type { DayBlockInput, DayCandidate } from '#lib/planning/day-plan';
	import { formatClock, parseClock } from '#lib/time/zoned';
	import type { DayView } from '#/routes/(app)/plan/+page.server';
	import { autoPlanRequest, dayErrorMessage, saveDayRequest, type DayRequest } from './day-plan-request';

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
	let confirmClear = $state(false);
	let lastRequest = $state<DayRequest | null>(null);

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
		return minutes > 0 ? `+${formatMinutes(minutes)}` : `−${formatMinutes(Math.abs(minutes))}`;
	}

	/** Relative minute offset in the timeline, sized by the hour token. */
	function hourOffset(minutes: number): string {
		return `calc(${(minutes / 60).toFixed(4)} * var(--layout-timeline-hour))`;
	}

	/** Drop the stored id/date before sending a block back to the API. */
	async function send(request: DayRequest): Promise<void> {
		busy = true;
		error = null;
		lastRequest = request;
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
			lastRequest = null;
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
		confirmClear = false;
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

	function blockTitle(block: DayView['blocks'][number]): string {
		return block.kind === 'issue'
			? `${block.org}/${block.name}#${block.issueNumber}`
			: 'Buffer';
	}

	function sizeLabel(size: string): string {
		if (size === 'sm') return 'S';
		if (size === 'md') return 'M';
		if (size === 'lg') return 'L';
		return size.toUpperCase();
	}
</script>

<section class="flex flex-col gap-4" data-testid="day-plan" data-day={view.date}>
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-0.5">
			<h2 class="text-heading-sm font-semibold text-fg">{view.label}</h2>
			<p class="text-caption text-fg-secondary tabular-nums">
				{formatMinutes(view.availableMinutes)} available · {formatMinutes(view.plannedMinutes)} planned ·
				{formatMinutes(view.bufferMinutes)} buffer target
			</p>
		</div>

		{#if mayWrite}
			<div class="flex flex-wrap items-center gap-2">
				{#if busy}
					<span class="text-caption text-fg-secondary" role="status">Saving…</span>
				{/if}
				<Button size="sm" onclick={autoPlan} disabled={busy}>Auto-plan</Button>
				<Button variant="outline" size="sm" onclick={() => (confirmClear = true)} disabled={busy}>
					Clear day
				</Button>
				<Button variant="ghost" size="sm" href="/settings/availability">Working hours</Button>
			</div>
		{/if}
	</header>

	{#if error}
		<InlineStatus tone="error" message={error}>
			{#snippet action()}
				<Button
					variant="ghost"
					size="xs"
					disabled={busy || lastRequest === null}
					onclick={() => lastRequest && void send(lastRequest)}
				>
					Retry
				</Button>
			{/snippet}
		</InlineStatus>
	{/if}

	<div class="flex flex-wrap items-start gap-x-6 gap-y-2">
		<dl
			class="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2 border-y border-border-subtle py-2 sm:grid-cols-5"
			aria-label="ALPEN summary"
		>
			<div data-alpen="A" class="flex min-w-0 flex-col gap-0.5">
				<dt class="text-caption text-fg-secondary">Tasks</dt>
				<dd class="m-0 text-body text-fg tabular-nums">
					{view.candidates.length}
					{view.candidates.length === 1 ? 'candidate' : 'candidates'}
				</dd>
			</div>
			<div data-alpen="L" class="flex min-w-0 flex-col gap-0.5">
				<dt class="text-caption text-fg-secondary">Planned</dt>
				<dd class="m-0 text-body text-fg tabular-nums">{formatMinutes(view.plannedMinutes)}</dd>
			</div>
			<div data-alpen="P" class="flex min-w-0 flex-col gap-0.5">
				<dt class="text-caption text-fg-secondary">Buffer</dt>
				<dd class="m-0 text-body text-fg tabular-nums">{formatMinutes(view.bufferMinutes)}</dd>
			</div>
			<div data-alpen="E" class="flex min-w-0 flex-col gap-0.5">
				<dt class="text-caption text-fg-secondary">Priority order</dt>
				<dd class="m-0 text-body text-fg">Highest first</dd>
			</div>
			<div data-alpen="N" class="flex min-w-0 flex-col gap-0.5">
				<dt class="text-caption text-fg-secondary">Variance</dt>
				<dd class="m-0 text-body text-fg tabular-nums">{signed(view.review.varianceMinutes)}</dd>
			</div>
		</dl>

		<div class="flex flex-col gap-1">
			{#if view.availableMinutes === 0}
				<InlineStatus
					tone="info"
					message="Not a work day. You can still place blocks manually, but auto-plan produces nothing."
				/>
			{/if}
			{#if overbooked}
				<InlineStatus
					tone="error"
					message={`Overbooked by ${formatMinutes(view.plannedMinutes + view.bufferPlannedMinutes - view.availableMinutes)}.`}
				/>
			{/if}
			{#if outsideHours}
				<InlineStatus
					tone="warning"
					message="Some blocks fall outside working hours. Manual plans may overrun; auto-plan does not."
				/>
			{/if}
		</div>
	</div>

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
		<div class="flex flex-col gap-2">
			<h3 class="text-body font-semibold text-fg">Timeline</h3>
			{#if view.blocks.length === 0}
				<EmptyState
					title="No blocks yet."
					description="Auto-plan the day or add a candidate."
					class="border-y border-border-subtle py-6"
				/>
			{/if}
			<div
				class="relative overflow-hidden border border-border-subtle bg-canvas"
				style={`height: calc(${((view.endMinute - view.startMinute) / 60).toFixed(4)} * var(--layout-timeline-hour));`}
			>
				{#each hourMarks as minute (minute)}
					<div
						class="absolute start-16 end-0 border-t border-border-subtle"
						style={`top: ${hourOffset(minute - view.startMinute)};`}
						aria-hidden="true"
					></div>
					<span
						class="mono absolute start-0 top-0 w-14 text-end text-caption text-fg-muted"
						style={`top: ${hourOffset(minute - view.startMinute)};`}
					>
						{formatClock(minute)}
					</span>
				{/each}

				{#each view.blocks as block (block.id)}
					<div
						class="absolute start-16 end-2 overflow-hidden border border-border-subtle border-s-2 border-s-primary bg-canvas px-2 py-1"
						style={`top: ${hourOffset(block.startMinute - view.startMinute)}; height: ${hourOffset(block.minutes)}; min-height: var(--size-timeline-block);`}
						data-block={block.id}
					>
						<div class="flex min-w-0 items-baseline gap-2 leading-tight">
							<span class="mono shrink-0 text-caption text-fg-secondary">
								{planBlockLabel(block.startMinute, block.startMinute + block.minutes)}
							</span>
							<span class="min-w-0 flex-1 truncate text-body text-fg">{blockTitle(block)}</span>
							<span class="shrink-0 text-caption text-fg-secondary tabular-nums">
								{formatMinutes(block.minutes)}
							</span>
						</div>
						{#if mayWrite}
							<div class="mt-0.5 flex items-center gap-1">
								<input
									type="time"
									class="mono h-(--size-control-sm) rounded-sm border border-border-strong bg-canvas px-1 text-caption"
									value={formatClock(block.startMinute)}
									aria-label={`Start time for ${blockTitle(block)}`}
									onchange={(event) => editStart(block, event.currentTarget.value)}
								/>
								<button
									type="button"
									class="ms-auto inline-flex h-(--size-control-sm) items-center rounded-sm px-1 text-caption text-fg-secondary hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
			<h3 class="text-body font-semibold text-fg">Candidates</h3>
			{#if view.candidates.length === 0}
				<EmptyState
					title="No candidates."
					description="No open, sized issues in this week."
					class="border-y border-border-subtle py-6"
				/>
			{:else}
				<ul class="flex flex-col border-t border-border-subtle">
					{#each view.candidates as candidate (`${candidate.org}/${candidate.name}#${candidate.issueNumber}`)}
						<li
							class="flex items-center gap-2 border-b border-border-subtle px-1 py-1.5 last:border-b-0"
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-body text-fg">{candidate.title}</p>
								<p class="flex flex-wrap items-baseline gap-x-2 text-caption text-fg-secondary">
									<span class="mono tabular-nums">
										{candidate.org}/{candidate.name}#{candidate.issueNumber}
									</span>
									{#if candidate.priority}
										<span>{candidate.priority}</span>
									{/if}
								</p>
							</div>
							<span class="w-6 shrink-0 text-end text-caption text-fg-secondary">
								<span class="sr-only">Size </span>{sizeLabel(candidate.size)}
							</span>
							<span class="w-12 shrink-0 text-end text-caption text-fg-secondary tabular-nums">
								<span class="sr-only">Estimate </span>{formatMinutes(candidate.minutes)}
							</span>
							{#if mayWrite}
								<Button
									variant="outline"
									size="xs"
									onclick={() => addCandidate(candidate)}
									disabled={busy}
								>
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
		<h3 class="text-body font-semibold text-fg">Planned vs actual</h3>
		{#if view.review.rows.length === 0}
			<EmptyState
				title="Nothing to compare."
				description="Add an issue block to compare planned and actual time."
				class="border-y border-border-subtle py-4"
			/>
		{:else}
			<ul class="flex flex-col border-t border-border-subtle">
				{#each view.review.rows as row (row.key)}
					<li
						class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border-subtle px-1 py-1.5 text-body last:border-b-0"
					>
						<span class="mono min-w-0 flex-1 truncate">{row.key}</span>
						<span class="text-caption text-fg-secondary tabular-nums">
							planned {formatMinutes(row.plannedMinutes)} · actual {formatMinutes(row.actualMinutes)}
						</span>
						<span
							class={row.varianceMinutes > 0
								? 'status status-error tabular-nums'
								: 'status status-muted tabular-nums'}
						>
							{signed(row.varianceMinutes)}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>

<Dialog.Root open={confirmClear} onOpenChange={(next) => (confirmClear = next)}>
	<Dialog.Content class="sm:max-w-[var(--layout-dialog-width)]">
		<Dialog.Header>
			<Dialog.Title>Clear the day?</Dialog.Title>
			<Dialog.Description>
				This removes all {view.blocks.length} planned blocks from {view.label}. Auto-plan can
				rebuild them from the current week.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" size="sm" onclick={() => (confirmClear = false)}>Cancel</Button>
			<Button variant="destructive" size="sm" disabled={busy} onclick={() => void clearDay()}>
				Clear Day
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
