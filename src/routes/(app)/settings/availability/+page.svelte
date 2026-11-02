<script lang="ts">
	import { untrack } from 'svelte';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Button } from '#lib/components/ui/button';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import * as NativeSelect from '#lib/components/ui/native-select';
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
	class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6"
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
		<Field.Field>
			<Field.Label for="availability-timezone">Timezone</Field.Label>
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
			<Field.Description>An IANA zone, such as Europe/Berlin or UTC.</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="availability-buffer">Buffer (%)</Field.Label>
			<Input id="availability-buffer" type="number" min="0" max="90" bind:value={bufferPercent} />
			<Field.Description>The share of the work window reserved for slack (0–90).</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="availability-start">Start time</Field.Label>
			<Input id="availability-start" type="time" bind:value={startTime} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="availability-end">End time</Field.Label>
			<Input id="availability-end" type="time" bind:value={endTime} />
		</Field.Field>
		<Field.Field>
			<Field.Label>Work days</Field.Label>
			<div class="flex flex-wrap gap-x-4 gap-y-2">
				{#each WEEKDAYS as day (day.value)}
					<label class="flex items-center gap-2 text-body">
						<input
							type="checkbox"
							class="size-4 accent-primary"
							value={day.value}
							bind:group={workDays}
						/>
						{day.label}
					</label>
				{/each}
			</div>
			<Field.Description>At least one ISO weekday, Monday through Sunday.</Field.Description>
		</Field.Field>
	</Section>

	<Section
		title="Blocked windows"
		description="Recurring windows apply every week on a weekday; one-off windows apply to a single date."
	>
		{#if windows.length === 0}
			<p class="text-body text-fg-secondary">No blocked windows yet.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-body">
					<thead>
						<tr>
							<th
								class="h-9 border-b border-border-subtle bg-surface-2 px-2 text-left font-semibold"
							>
								Label
							</th>
							<th
								class="h-9 border-b border-border-subtle bg-surface-2 px-2 text-left font-semibold"
							>
								Schedule
							</th>
							<th
								class="h-9 border-b border-border-subtle bg-surface-2 px-2 text-left font-semibold"
							>
								From
							</th>
							<th
								class="h-9 border-b border-border-subtle bg-surface-2 px-2 text-left font-semibold"
							>
								To
							</th>
							<th class="h-9 border-b border-border-subtle bg-surface-2 px-2">
								<span class="sr-only">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each windows as window, index (window.key)}
							<tr class="border-b border-border-subtle">
								<td class="py-1 pr-2">
									<Input
										bind:value={window.label}
										maxlength={60}
										placeholder="Lunch"
										aria-label={`Window ${index + 1} label`}
										class="h-7"
									/>
								</td>
								<td class="py-1 pr-2">
									<div class="flex flex-wrap items-center gap-2">
										<NativeSelect.Root
											value={window.recurring ? 'recurring' : 'one-off'}
											onchange={(event) => kindChanged(event, window)}
											aria-label={`Window ${index + 1} kind`}
											class="w-28"
										>
											<NativeSelect.Option value="recurring">Recurring</NativeSelect.Option>
											<NativeSelect.Option value="one-off">One-off</NativeSelect.Option>
										</NativeSelect.Root>
										{#if window.recurring}
											<NativeSelect.Root
												value={String(window.weekday)}
												onchange={(event) => weekdayChanged(event, window)}
												aria-label={`Window ${index + 1} weekday`}
												class="w-24"
											>
												{#each WEEKDAYS as day (day.value)}
													<NativeSelect.Option value={String(day.value)}>
														{day.label}
													</NativeSelect.Option>
												{/each}
											</NativeSelect.Root>
										{:else}
											<Input
												type="date"
												bind:value={window.date}
												aria-label={`Window ${index + 1} date`}
												class="h-7 w-36"
											/>
										{/if}
									</div>
								</td>
								<td class="py-1 pr-2">
									<Input
										type="time"
										bind:value={window.startTime}
										aria-label={`Window ${index + 1} start time`}
										class="h-7 w-28"
									/>
								</td>
								<td class="py-1 pr-2">
									<Input
										type="time"
										bind:value={window.endTime}
										aria-label={`Window ${index + 1} end time`}
										class="h-7 w-28"
									/>
								</td>
								<td class="py-1 text-right">
									<Button
										variant="ghost"
										size="sm"
										onclick={() => removeWindow(window.key)}
										aria-label={`Remove ${window.label || 'window'}`}
									>
										Remove
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<div>
			<Button type="button" variant="outline" onclick={addWindow}>Add window</Button>
		</div>
	</Section>

	<Section
		title="Calendar feed"
		description="A read-only ICS URL containing your issue blocks, buffer and blocked windows for the next six weeks."
	>
		<dl class="label-value">
			<dt>Status</dt>
			<dd>
				{#if feed}
					<span class="status status-success">
						<CircleCheckIcon aria-hidden="true" />
						Active
					</span>
				{:else}
					<span class="status status-muted">Not created</span>
				{/if}
			</dd>
			{#if feed}
				<dt>Hint</dt>
				<dd><span class="mono break-all">{feed.hint}</span></dd>
			{/if}
		</dl>

		{#if secretUrl}
			<p class="text-body leading-body text-fg-secondary">
				Copy this URL now. It is shown once and cannot be recovered; regenerate it if you lose
				it.
			</p>
			<div class="flex flex-wrap items-center gap-2">
				<Input
					readonly
					value={secretUrl}
					class="min-w-0 flex-1"
					aria-label="Calendar feed URL"
				/>
				<Button type="button" variant="outline" onclick={copySecret}>
					<CopyIcon />
					{copied ? 'Copied' : 'Copy'}
				</Button>
			</div>
		{:else}
			<div>
				<Button type="button" variant="outline" onclick={createFeed}>
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
				<Button type="button" variant="destructive" onclick={() => (confirmOpen = true)}>
					Revoke Calendar Feed
				</Button>
			</div>
		</Section>
	{/if}

	<footer class="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
		<Button type="submit" disabled={saving} class="min-w-24">
			{saving ? 'Saving…' : 'Save Changes'}
		</Button>
		<span class="min-h-4" aria-live="polite">
			{#if saved}
				<span class="status status-success">
					<CircleCheckIcon aria-hidden="true" />
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
