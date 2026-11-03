<script lang="ts">
	import { untrack } from 'svelte';
	import {
		Button,
		FormCheck,
		FormGroup,
		FormText,
		Input,
		Label,
		Table
	} from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import ConfirmDialog from '#lib/components/settings/confirm-dialog.svelte';
	import Section from '#lib/components/settings/section.svelte';
	import { formatClock, parseClock } from '#lib/time/zoned';
	import type { PageProps } from './$types';

	/**
	 * Personal availability (SPEC §8): working hours, blocked windows and the
	 * calendar feed. Everything is posted to the caller-scoped `/api/me/*`
	 * routes; the raw feed URL is only ever assigned from the create/rotate
	 * response, so a page load cannot leak a token.
	 */
	interface FeedMeta {
		hint: string;
		createdAt: number;
	}

	interface WindowRow {
		key: number;
		label: string;
		recurring: boolean;
		weekday: number;
		date: string;
		startTime: string;
		endTime: string;
	}

	const WEEKDAYS = [
		{ value: 1, label: 'Mon' },
		{ value: 2, label: 'Tue' },
		{ value: 3, label: 'Wed' },
		{ value: 4, label: 'Thu' },
		{ value: 5, label: 'Fri' },
		{ value: 6, label: 'Sat' },
		{ value: 7, label: 'Sun' }
	] as const;

	const TIMEZONES = [
		'UTC',
		'Europe/Berlin',
		'Europe/London',
		'Europe/Paris',
		'America/New_York',
		'America/Chicago',
		'America/Denver',
		'America/Los_Angeles',
		'Asia/Tokyo',
		'Asia/Singapore',
		'Australia/Sydney'
	];

	let { data }: PageProps = $props();

	const initial = untrack(() => data);
	const hours = untrack(() => initial.hours);
	const feedMeta = untrack(() => initial.feed as FeedMeta | null);

	let timezone = $state(hours.timezone);
	let startTime = $state(formatClock(hours.startMinute));
	let endTime = $state(formatClock(hours.endMinute));
	let workDays = $state<number[]>([...hours.workDays]);
	let bufferPercent = $state<number | null>(hours.bufferPercent);
	let windows = $state<WindowRow[]>(
		initial.windows.map((window, index) => ({
			key: index,
			label: window.label,
			recurring: window.weekday !== null,
			weekday: window.weekday ?? 1,
			date: window.date ?? '',
			startTime: formatClock(window.startMinute),
			endTime: formatClock(window.endMinute)
		}))
	);
	let feed = $state<FeedMeta | null>(feedMeta);
	let secretUrl = $state<string | null>(null);
	let copied = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let error = $state<string | null>(null);
	let confirmOpen = $state(false);

	let nextWindowKey = initial.windows.length;

	function addWindow(): void {
		windows = [
			...windows,
			{
				key: nextWindowKey++,
				label: '',
				recurring: true,
				weekday: 1,
				date: '',
				startTime: '12:00',
				endTime: '13:00'
			}
		];
	}

	function removeWindow(key: number): void {
		windows = windows.filter((window) => window.key !== key);
	}

	function kindChanged(event: Event, window: WindowRow): void {
		window.recurring = (event.currentTarget as HTMLSelectElement).value === 'recurring';
	}

	function weekdayChanged(event: Event, window: WindowRow): void {
		window.weekday = Number((event.currentTarget as HTMLSelectElement).value);
	}

	async function saveAvailability(): Promise<void> {
		saving = true;
		saved = false;
		error = null;

		const payload = {
			timezone,
			start_minute: parseClock(startTime) ?? hours.startMinute,
			end_minute: parseClock(endTime) ?? hours.endMinute,
			work_days: [...workDays].sort((a, b) => a - b),
			buffer_percent: bufferPercent ?? 20,
			windows: windows.map((window) => ({
				label: window.label,
				weekday: window.recurring ? window.weekday : null,
				date: window.recurring ? null : window.date,
				start_minute: parseClock(window.startTime) ?? 540,
				end_minute: parseClock(window.endTime) ?? 600
			}))
		};

		try {
			const response = await fetch('/api/me/availability', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				error = body?.message ?? 'Availability could not be saved';
				return;
			}
			saved = true;
		} catch {
			error = 'Availability could not be saved';
		} finally {
			saving = false;
		}
	}

	async function createFeed(): Promise<void> {
		error = null;
		saved = false;
		try {
			const response = await fetch('/api/me/calendar-feed', { method: 'POST' });
			if (!response.ok) {
				error = 'The calendar feed could not be created';
				return;
			}
			const created = (await response.json()) as FeedMeta & { url: string };
			feed = { hint: created.hint, createdAt: created.createdAt };
			secretUrl = created.url;
			copied = false;
		} catch {
			error = 'The calendar feed could not be created';
		}
	}

	async function revokeFeed(): Promise<void> {
		error = null;
		saved = false;
		try {
			const response = await fetch('/api/me/calendar-feed', { method: 'DELETE' });
			if (!response.ok) {
				error = 'The calendar feed could not be revoked';
				return;
			}
			feed = null;
			secretUrl = null;
			saved = true;
		} catch {
			error = 'The calendar feed could not be revoked';
		}
	}

	async function copySecret(): Promise<void> {
		if (!secretUrl) return;
		try {
			await navigator.clipboard.writeText(secretUrl);
			copied = true;
		} catch {
			error = 'The URL could not be copied';
		}
	}
</script>

<form
	class="d-flex w-100 flex-column gap-4"
	onsubmit={(event) => {
		event.preventDefault();
		void saveAvailability();
	}}
>
	{#if error}
		<InlineStatus tone="error" message={error} />
	{/if}

	<Section
		title="Working hours"
		description="The day view uses these hours until you change them. Windows subtract from the work window."
	>
		<FormGroup class="mb-0">
			<Label for="availability-timezone">Timezone</Label>
			<Input
				id="availability-timezone"
				list="availability-timezones"
				bind:value={timezone}
				placeholder="Europe/Berlin"
			/>
			<datalist id="availability-timezones">
				{#each TIMEZONES as zone (zone)}
					<option value={zone}></option>
				{/each}
			</datalist>
			<FormText>An IANA zone, such as Europe/Berlin or UTC.</FormText>
		</FormGroup>
		<FormGroup class="mb-0">
			<Label for="availability-buffer">Buffer (%)</Label>
			<Input id="availability-buffer" type="number" min="0" max="90" bind:value={bufferPercent} />
			<FormText>The share of the work window reserved for slack (0–90).</FormText>
		</FormGroup>
		<FormGroup class="mb-0">
			<Label for="availability-start">Start time</Label>
			<Input id="availability-start" type="time" bind:value={startTime} />
		</FormGroup>
		<FormGroup class="mb-0">
			<Label for="availability-end">End time</Label>
			<Input id="availability-end" type="time" bind:value={endTime} />
		</FormGroup>
		<FormGroup class="mb-0">
			<span id="availability-work-days" class="form-label d-block">Work days</span>
			<div
				class="d-flex flex-wrap column-gap-4 row-gap-1"
				role="group"
				aria-labelledby="availability-work-days"
			>
				{#each WEEKDAYS as day (day.value)}
					<FormCheck
						type="checkbox"
						class="mb-0"
						value={day.value}
						bind:group={workDays}
						label={day.label}
					/>
				{/each}
			</div>
			<FormText>At least one ISO weekday, Monday through Sunday.</FormText>
		</FormGroup>
	</Section>

	<Section
		title="Blocked windows"
		description="Recurring windows apply every week on a weekday; one-off windows apply to a single date."
	>
		{#if windows.length === 0}
			<p class="mb-0 text-body-secondary">No blocked windows yet.</p>
		{:else}
			<Table responsive class="align-middle">
				<thead>
					<tr>
						<th scope="col">Label</th>
						<th scope="col">Schedule</th>
						<th scope="col">From</th>
						<th scope="col">To</th>
						<th scope="col">
							<span class="visually-hidden">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each windows as window, index (window.key)}
						<tr>
							<td>
								<Input
									bind:value={window.label}
									maxlength={60}
									placeholder="Lunch"
									bsSize="sm"
									aria-label={`Window ${index + 1} label`}
								/>
							</td>
							<td>
								<div class="d-flex flex-wrap align-items-center gap-2">
									<select
										class="form-select form-select-sm"
										value={window.recurring ? 'recurring' : 'one-off'}
										onchange={(event) => kindChanged(event, window)}
										aria-label={`Window ${index + 1} kind`}
										style="width:7rem"
									>
										<option value="recurring">Recurring</option>
										<option value="one-off">One-off</option>
									</select>
									{#if window.recurring}
										<select
											class="form-select form-select-sm"
											value={String(window.weekday)}
											onchange={(event) => weekdayChanged(event, window)}
											aria-label={`Window ${index + 1} weekday`}
											style="width:6rem"
										>
											{#each WEEKDAYS as day (day.value)}
												<option value={String(day.value)}>
													{day.label}
												</option>
											{/each}
										</select>
									{:else}
										<Input
											type="date"
											bind:value={window.date}
											bsSize="sm"
											aria-label={`Window ${index + 1} date`}
											style="width:9rem"
										/>
									{/if}
								</div>
							</td>
							<td>
								<Input
									type="time"
									bind:value={window.startTime}
									bsSize="sm"
									aria-label={`Window ${index + 1} start time`}
									style="width:7rem"
								/>
							</td>
							<td>
								<Input
									type="time"
									bind:value={window.endTime}
									bsSize="sm"
									aria-label={`Window ${index + 1} end time`}
									style="width:7rem"
								/>
							</td>
							<td class="text-end">
								<Button
									color="link"
									size="sm"
									class="px-1 py-0 text-secondary"
									onclick={() => removeWindow(window.key)}
									aria-label={`Remove ${window.label || 'window'}`}
								>
									Remove
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</Table>
		{/if}

		<div>
			<Button type="button" color="outline-secondary" onclick={addWindow}>Add window</Button>
		</div>
	</Section>

	<Section
		title="Calendar feed"
		description="A read-only ICS URL containing your issue blocks, buffer and blocked windows for the next six weeks."
	>
		<dl class="property-list">
			<dt>Status</dt>
			<dd>
				{#if feed}
					<span class="d-inline-flex align-items-center gap-1 small text-success">
						<i class="bi bi-check-circle" aria-hidden="true"></i>
						Active
					</span>
				{:else}
					<span class="small text-body-secondary">Not created</span>
				{/if}
			</dd>
			{#if feed}
				<dt>Hint</dt>
				<dd><span class="font-monospace text-break">{feed.hint}</span></dd>
			{/if}
		</dl>

		{#if secretUrl}
			<p class="mb-0 text-body-secondary">
				Copy this URL now. It is shown once and cannot be recovered; regenerate it if you lose
				it.
			</p>
			<div class="d-flex flex-wrap align-items-center gap-2">
				<Input
					readonly
					value={secretUrl}
					class="min-w-0 flex-grow-1"
					aria-label="Calendar feed URL"
				/>
				<Button type="button" color="outline-secondary" onclick={copySecret}>
					<i class="bi bi-clipboard me-2" aria-hidden="true"></i>
					{copied ? 'Copied' : 'Copy'}
				</Button>
			</div>
		{:else}
			<div>
				<Button type="button" color="outline-secondary" onclick={createFeed}>
					{feed ? 'Regenerate Feed' : 'Create Calendar Link'}
				</Button>
			</div>
		{/if}
	</Section>

	{#if feed}
		<Section
			title="Revoke feed"
			description="Revoking stops every calendar app using this URL. You can create a new link afterwards."
			danger
		>
			<div>
				<Button type="button" color="danger" onclick={() => (confirmOpen = true)}>
					Revoke Calendar Feed
				</Button>
			</div>
		</Section>
	{/if}

	<footer class="d-flex flex-wrap align-items-center gap-3 border-top pt-3">
		<Button type="submit" color="primary" disabled={saving}>
			{saving ? 'Saving…' : 'Save Changes'}
		</Button>
		<span style="min-height:1rem" aria-live="polite">
			{#if saved}
				<span class="d-inline-flex align-items-center gap-1 small text-success">
					<i class="bi bi-check-circle" aria-hidden="true"></i>
					Saved.
				</span>
			{/if}
		</span>
	</footer>
</form>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Revoke Calendar Feed"
	description="Calendar apps using the current URL stop updating. This cannot be undone, but you can create a new link."
	confirmLabel="Revoke Calendar Feed"
	onconfirm={() => void revokeFeed()}
/>
