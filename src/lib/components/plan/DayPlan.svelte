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
	import {
		Button,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
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
		return `calc(${(minutes / 60).toFixed(4)} * var(--funnel-timeline-hour))`;
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

<section class="d-flex flex-column gap-3" data-testid="day-plan" data-day={view.date}>
	<header class="d-flex flex-wrap align-items-end justify-content-between gap-3">
		<div class="d-flex flex-column gap-1">
			<h2 class="fs-6 fw-semibold text-body mb-0">{view.label}</h2>
			<p class="small text-body-secondary tnum mb-0">
				{formatMinutes(view.availableMinutes)} available · {formatMinutes(view.plannedMinutes)} planned ·
				{formatMinutes(view.bufferMinutes)} buffer target
			</p>
		</div>

		{#if mayWrite}
			<div class="d-flex flex-wrap align-items-center gap-2">
				{#if busy}
					<span class="small text-body-secondary" role="status">Saving…</span>
				{/if}
				<Button color="primary" size="sm" onclick={autoPlan} disabled={busy}>Auto-plan</Button>
				<Button color="outline-secondary" size="sm" onclick={() => (confirmClear = true)} disabled={busy}>
					Clear day
				</Button>
				<Button color="link" size="sm" href="/settings/availability" class="text-decoration-none">
					Working hours
				</Button>
			</div>
		{/if}
	</header>

	{#if error}
		<InlineStatus tone="error" message={error}>
			{#snippet action()}
				<Button
					color="link"
					size="sm"
					disabled={busy || lastRequest === null}
					onclick={() => lastRequest && void send(lastRequest)}
				>
					Retry
				</Button>
			{/snippet}
		</InlineStatus>
	{/if}

	<div class="d-flex flex-wrap align-items-start gap-3">
		<dl class="day-alpen min-w-0 flex-grow-1 border-top border-bottom py-2 mb-0" aria-label="ALPEN summary">
			<div data-alpen="A" class="d-flex min-w-0 flex-column gap-1">
				<dt class="small text-body-secondary fw-normal">Tasks</dt>
				<dd class="m-0 text-body tnum">
					{view.candidates.length}
					{view.candidates.length === 1 ? 'candidate' : 'candidates'}
				</dd>
			</div>
			<div data-alpen="L" class="d-flex min-w-0 flex-column gap-1">
				<dt class="small text-body-secondary fw-normal">Planned</dt>
				<dd class="m-0 text-body tnum">{formatMinutes(view.plannedMinutes)}</dd>
			</div>
			<div data-alpen="P" class="d-flex min-w-0 flex-column gap-1">
				<dt class="small text-body-secondary fw-normal">Buffer</dt>
				<dd class="m-0 text-body tnum">{formatMinutes(view.bufferMinutes)}</dd>
			</div>
			<div data-alpen="E" class="d-flex min-w-0 flex-column gap-1">
				<dt class="small text-body-secondary fw-normal">Priority order</dt>
				<dd class="m-0 text-body">Highest first</dd>
			</div>
			<div data-alpen="N" class="d-flex min-w-0 flex-column gap-1">
				<dt class="small text-body-secondary fw-normal">Variance</dt>
				<dd class="m-0 text-body tnum">{signed(view.review.varianceMinutes)}</dd>
			</div>
		</dl>

		<div class="d-flex flex-column gap-1">
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

	<div class="day-layout">
		<div class="d-flex flex-column gap-2">
			<h3 class="small fw-semibold text-body mb-0">Timeline</h3>
			{#if view.blocks.length === 0}
				<EmptyState
					title="No blocks yet."
					description="Auto-plan the day or add a candidate."
					class="border-top border-bottom py-3"
				/>
			{/if}
			<div
				class="day-timeline position-relative overflow-hidden border bg-body"
				style={`height: calc(${((view.endMinute - view.startMinute) / 60).toFixed(4)} * var(--funnel-timeline-hour));`}
			>
				{#each hourMarks as minute (minute)}
					<div
						class="day-hour-line position-absolute"
						style={`top: ${hourOffset(minute - view.startMinute)};`}
						aria-hidden="true"
					></div>
					<span
						class="day-hour-label font-monospace position-absolute text-end small text-body-tertiary"
						style={`top: ${hourOffset(minute - view.startMinute)};`}
					>
						{formatClock(minute)}
					</span>
				{/each}

				{#each view.blocks as block (block.id)}
					<div
						class="day-block position-absolute overflow-hidden border bg-body px-2 py-1"
						style={`top: ${hourOffset(block.startMinute - view.startMinute)}; height: ${hourOffset(block.minutes)}; min-height: var(--funnel-row-compact);`}
						data-block={block.id}
					>
						<div class="d-flex min-w-0 align-items-baseline gap-2 lh-1">
							<span class="font-monospace flex-shrink-0 small text-body-secondary">
								{planBlockLabel(block.startMinute, block.startMinute + block.minutes)}
							</span>
							<span class="min-w-0 flex-grow-1 text-truncate text-body">{blockTitle(block)}</span>
							<span class="flex-shrink-0 small text-body-secondary tnum">
								{formatMinutes(block.minutes)}
							</span>
						</div>
						{#if mayWrite}
							<div class="mt-1 d-flex align-items-center gap-1">
								<input
									type="time"
									class="form-control form-control-sm day-block-time font-monospace"
									value={formatClock(block.startMinute)}
									aria-label={`Start time for ${blockTitle(block)}`}
									onchange={(event) => editStart(block, event.currentTarget.value)}
								/>
								<Button
									color="link"
									size="sm"
									class="ms-auto text-decoration-none text-body-secondary p-0 small"
									onclick={() => removeBlock(block.id)}
								>
									Remove
								</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<aside class="d-flex flex-column gap-2" aria-label="Day candidates">
			<h3 class="small fw-semibold text-body mb-0">Candidates</h3>
			{#if view.candidates.length === 0}
				<EmptyState
					title="No candidates."
					description="No open, sized issues in this week."
					class="border-top border-bottom py-3"
				/>
			{:else}
				<ul class="d-flex flex-column border-top list-unstyled mb-0">
					{#each view.candidates as candidate (`${candidate.org}/${candidate.name}#${candidate.issueNumber}`)}
						<li class="d-flex align-items-center gap-2 border-bottom px-1 py-1">
							<div class="min-w-0 flex-grow-1">
								<p class="text-truncate text-body mb-0">{candidate.title}</p>
								<p class="d-flex flex-wrap align-items-baseline gap-2 small text-body-secondary mb-0">
									<span class="font-monospace tnum">
										{candidate.org}/{candidate.name}#{candidate.issueNumber}
									</span>
									{#if candidate.priority}
										<span>{candidate.priority}</span>
									{/if}
								</p>
							</div>
							<span class="flex-shrink-0 text-end small text-body-secondary" style="width: 1.5rem">
								<span class="visually-hidden">Size </span>{sizeLabel(candidate.size)}
							</span>
							<span class="flex-shrink-0 text-end small text-body-secondary tnum" style="width: 3rem">
								<span class="visually-hidden">Estimate </span>{formatMinutes(candidate.minutes)}
							</span>
							{#if mayWrite}
								<Button
									color="outline-secondary"
									size="sm"
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

	<section class="d-flex flex-column gap-2" aria-label="Planned versus actual">
		<h3 class="small fw-semibold text-body mb-0">Planned vs actual</h3>
		{#if view.review.rows.length === 0}
			<EmptyState
				title="Nothing to compare."
				description="Add an issue block to compare planned and actual time."
				class="border-top border-bottom py-3"
			/>
		{:else}
			<ul class="d-flex flex-column border-top list-unstyled mb-0">
				{#each view.review.rows as row (row.key)}
					<li
						class="d-flex flex-wrap align-items-baseline gap-2 border-bottom px-1 py-1 text-body"
					>
						<span class="font-monospace min-w-0 flex-grow-1 text-truncate">{row.key}</span>
						<span class="small text-body-secondary tnum">
							planned {formatMinutes(row.plannedMinutes)} · actual {formatMinutes(row.actualMinutes)}
						</span>
						<span class={row.varianceMinutes > 0 ? 'small text-danger tnum' : 'small text-body-secondary tnum'}>
							{signed(row.varianceMinutes)}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>

<Modal isOpen={confirmClear} toggle={() => (confirmClear = false)}>
	<ModalHeader toggle={() => (confirmClear = false)}>Clear the day?</ModalHeader>
	<ModalBody>
		This removes all {view.blocks.length} planned blocks from {view.label}. Auto-plan can
		rebuild them from the current week.
	</ModalBody>
	<ModalFooter>
		<Button color="secondary" outline size="sm" onclick={() => (confirmClear = false)}>Cancel</Button>
		<Button color="danger" size="sm" disabled={busy} onclick={() => void clearDay()}>
			Clear Day
		</Button>
	</ModalFooter>
</Modal>

<style>
	.day-alpen {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem 1.5rem;
	}

	.day-layout {
		display: grid;
		gap: 1rem;
	}

	.day-hour-line {
		inset-inline-start: 4rem;
		inset-inline-end: 0;
		border-top: 1px solid var(--bs-border-color);
	}

	.day-hour-label {
		inset-inline-start: 0;
		width: 3.5rem;
	}

	.day-block {
		inset-inline-start: 4rem;
		inset-inline-end: 0.5rem;
		border-inline-start: 2px solid var(--bs-primary) !important;
	}

	.day-block-time {
		width: 6.5rem;
	}

	.tnum {
		font-variant-numeric: tabular-nums;
	}

	@media (min-width: 576px) {
		.day-alpen {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
	}

	@media (min-width: 992px) {
		.day-layout {
			grid-template-columns: minmax(0, 1fr) 18rem;
		}
	}
</style>
