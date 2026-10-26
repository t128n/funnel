<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/primitives/button';
	import * as Card from '#lib/components/primitives/card';
	import * as Field from '#lib/components/primitives/field';
	import { Input } from '#lib/components/primitives/input';
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
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

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

	async function saveAvailability(): Promise<void> {
		saving = true;
		message = null;
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
			message = 'Availability saved';
		} catch {
			error = 'Availability could not be saved';
		} finally {
			saving = false;
		}
	}

	async function createFeed(): Promise<void> {
		error = null;
		message = null;
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
		message = null;
		try {
			const response = await fetch('/api/me/calendar-feed', { method: 'DELETE' });
			if (!response.ok) {
				error = 'The calendar feed could not be revoked';
				return;
			}
			feed = null;
			secretUrl = null;
			message = 'Calendar feed revoked';
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

<div class="mx-auto flex w-full max-w-3xl flex-col gap-5">
	<header class="flex flex-col gap-1">
		<h1 class="text-sm font-medium">Availability</h1>
		<p class="text-muted-foreground text-xs leading-relaxed">
			Your working hours and blocked windows feed the ALPEN day view. The calendar link is a
			read-only subscription for Outlook or any other ICS app.
		</p>
	</header>

	{#if error}
		<p class="text-destructive text-xs" role="alert">{error}</p>
	{:else if message}
		<p class="text-muted-foreground text-xs">{message}</p>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Working hours</Card.Title>
			<Card.Description>
				The day view uses these hours until you change them. Windows subtract from the work
				window.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Field>
					<Field.Label>Timezone</Field.Label>
					<Input list="availability-timezones" bind:value={timezone} placeholder="Europe/Berlin" />
					<datalist id="availability-timezones">
						{#each TIMEZONES as zone (zone)}
							<option value={zone}></option>
						{/each}
					</datalist>
					<Field.Description>An IANA zone, such as Europe/Berlin or UTC.</Field.Description>
				</Field.Field>
				<Field.Field>
					<Field.Label>Buffer (%)</Field.Label>
					<Input type="number" min="0" max="90" bind:value={bufferPercent} />
					<Field.Description>The share of the work window reserved for slack (0–90).</Field.Description>
				</Field.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Field>
					<Field.Label>Start time</Field.Label>
					<Input type="time" bind:value={startTime} />
				</Field.Field>
				<Field.Field>
					<Field.Label>End time</Field.Label>
					<Input type="time" bind:value={endTime} />
				</Field.Field>
			</div>

			<Field.Field>
				<Field.Label>Work days</Field.Label>
				<div class="flex flex-wrap gap-2">
					{#each WEEKDAYS as day (day.value)}
						<label
							class="flex items-center gap-1.5 rounded-md border border-[color:var(--border)] px-2 py-1 text-xs"
						>
							<input
								type="checkbox"
								class="size-3.5 accent-foreground"
								value={day.value}
								bind:group={workDays}
							/>
							{day.label}
						</label>
					{/each}
				</div>
				<Field.Description>At least one ISO weekday, Monday through Sunday.</Field.Description>
			</Field.Field>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Blocked windows</Card.Title>
			<Card.Description>
				Recurring windows apply every week on a weekday; one-off windows apply to a single date.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#if windows.length === 0}
				<p class="text-muted-foreground text-xs">No blocked windows yet.</p>
			{:else}
				<ul class="flex flex-col divide-y divide-[color:var(--border)]">
					{#each windows as window (window.key)}
						<li class="flex flex-wrap items-end gap-2 py-3 first:pt-0 last:pb-0">
							<Field.Field class="min-w-40 flex-1">
								<Field.Label>Label</Field.Label>
								<Input bind:value={window.label} maxlength={60} placeholder="Lunch" />
							</Field.Field>

							<Field.Field class="w-32">
								<Field.Label>Kind</Field.Label>
								<select
									class="border-input bg-background h-8 rounded-md border px-2 text-sm"
									bind:value={window.recurring}
									aria-label="Window kind"
								>
									<option value={true}>Recurring</option>
									<option value={false}>One-off</option>
								</select>
							</Field.Field>

							{#if window.recurring}
								<Field.Field class="w-24">
									<Field.Label>Weekday</Field.Label>
									<select
										class="border-input bg-background h-8 rounded-md border px-2 text-sm"
										bind:value={window.weekday}
										aria-label="Blocked weekday"
									>
										{#each WEEKDAYS as day (day.value)}
											<option value={day.value}>{day.label}</option>
										{/each}
									</select>
								</Field.Field>
							{:else}
								<Field.Field class="w-40">
									<Field.Label>Date</Field.Label>
									<Input type="date" bind:value={window.date} />
								</Field.Field>
							{/if}

							<Field.Field class="w-28">
								<Field.Label>From</Field.Label>
								<Input type="time" bind:value={window.startTime} />
							</Field.Field>
							<Field.Field class="w-28">
								<Field.Label>To</Field.Label>
								<Input type="time" bind:value={window.endTime} />
							</Field.Field>

							<Button
								variant="ghost"
								size="sm"
								onclick={() => removeWindow(window.key)}
								aria-label={`Remove ${window.label || 'window'}`}
							>
								Remove
							</Button>
						</li>
					{/each}
				</ul>
			{/if}

			<div>
				<Button variant="outline" size="sm" onclick={addWindow}>Add window</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Calendar feed</Card.Title>
			<Card.Description>
				A read-only ICS URL containing your issue blocks, buffer and blocked windows for the
				next six weeks.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#if secretUrl}
				<p class="text-muted-foreground text-xs leading-relaxed">
					Copy this URL now. It is shown once and cannot be recovered; regenerate it if you lose
					it.
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<Input readonly value={secretUrl} class="min-w-64 flex-1" aria-label="Calendar feed URL" />
					<Button variant="outline" size="sm" onclick={copySecret}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
				</div>
			{:else if feed}
				<p class="text-muted-foreground text-xs">
					Active feed · hint <code>{feed.hint}</code>
				</p>
			{:else}
				<p class="text-muted-foreground text-xs">No calendar feed yet.</p>
			{/if}

			<div class="flex flex-wrap gap-2">
				{#if feed}
					<Button variant="outline" size="sm" onclick={createFeed}>Regenerate</Button>
					<Button variant="ghost" size="sm" onclick={revokeFeed}>Revoke</Button>
				{:else}
					<Button variant="outline" size="sm" onclick={createFeed}>Create calendar link</Button>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<footer class="flex justify-end">
		<Button onclick={saveAvailability} disabled={saving}>
			{saving ? 'Saving…' : 'Save changes'}
		</Button>
	</footer>
</div>
