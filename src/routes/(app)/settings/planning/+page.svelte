<script lang="ts">
	import { untrack } from 'svelte';
	import * as Avatar from '#lib/components/primitives/avatar';
	import { Button } from '#lib/components/primitives/button';
	import * as Card from '#lib/components/primitives/card';
	import * as Field from '#lib/components/primitives/field';
	import { Input } from '#lib/components/primitives/input';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import { hoursToMinutes, minutesToHours } from '#lib/planning';
	import { formatClock, parseClock } from '#lib/time/zoned';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** A roster row as edited here: hours are decimal, minutes only on save. */
	interface RosterRow {
		forge: string;
		instance: string;
		external_id: string;
		login: string;
		avatar_url?: string | null;
		active: boolean;
		hours: number;
	}

	const planning = untrack(() => data.planning);
	const candidates = untrack(() => data.candidates);
	const workDefaults = untrack(() => planning.work_defaults);

	/** ISO weekdays offered as work-day toggles, Monday first. */
	const WORKDAYS = [
		{ value: 1, label: 'Mon' },
		{ value: 2, label: 'Tue' },
		{ value: 3, label: 'Wed' },
		{ value: 4, label: 'Thu' },
		{ value: 5, label: 'Fri' },
		{ value: 6, label: 'Sat' },
		{ value: 7, label: 'Sun' }
	] as const;

	let sizeSm = $state<number | null>(minutesToHours(planning.size_minutes.sm));
	let sizeMd = $state<number | null>(minutesToHours(planning.size_minutes.md));
	let sizeLg = $state<number | null>(minutesToHours(planning.size_minutes.lg));
	let allocationPercent = $state<number | null>(planning.allocation_percent);
	let cycleWeeks = $state<number | null>(planning.cycle_weeks);
	let cycleAnchor = $state(planning.cycle_anchor);
	let timezone = $state(workDefaults.timezone);
	let startTime = $state(formatClock(workDefaults.start_minute));
	let endTime = $state(formatClock(workDefaults.end_minute));
	let workDays = $state<number[]>([...workDefaults.work_days]);
	let bufferPercent = $state<number | null>(workDefaults.buffer_percent);
	let roster = $state<RosterRow[]>(
		untrack(() =>
			planning.maintainers.map((maintainer) => ({
				...maintainer,
				hours: minutesToHours(maintainer.weekly_minutes)
			}))
		)
	);

	const rosterKeys = $derived(
		new Set(roster.map((row) => `${row.forge}:${row.instance}:${row.external_id}`))
	);
	const available = $derived(
		candidates.filter(
			(candidate) =>
				!rosterKeys.has(`${candidate.forge}:${candidate.instance}:${candidate.externalId}`)
		)
	);

	const payload = $derived(
		JSON.stringify({
			planning: {
				size_minutes: {
					sm: hoursToMinutes(sizeSm ?? 0),
					md: hoursToMinutes(sizeMd ?? 0),
					lg: hoursToMinutes(sizeLg ?? 0)
				},
				allocation_percent: allocationPercent ?? 60,
				cycle_weeks: cycleWeeks ?? 2,
				cycle_anchor: cycleAnchor,
				work_defaults: {
					timezone,
					start_minute: parseClock(startTime) ?? workDefaults.start_minute,
					end_minute: parseClock(endTime) ?? workDefaults.end_minute,
					work_days: [...workDays].sort((a, b) => a - b),
					buffer_percent: bufferPercent ?? 20
				},
				maintainers: roster.map((row) => ({
					forge: row.forge,
					instance: row.instance,
					external_id: row.external_id,
					login: row.login,
					avatar_url: row.avatar_url ?? null,
					weekly_minutes: hoursToMinutes(row.hours ?? 0),
					active: row.active
				}))
			}
		})
	);

	function addMaintainer(candidate: (typeof candidates)[number]): void {
		roster = [
			...roster,
			{
				forge: candidate.forge,
				instance: candidate.instance,
				external_id: candidate.externalId,
				login: candidate.login,
				avatar_url: candidate.avatarUrl,
				active: true,
				hours: 0
			}
		];
	}

	function removeMaintainer(index: number): void {
		roster = roster.filter((_, position) => position !== index);
	}

	function initial(login: string): string {
		return login.slice(0, 1).toUpperCase() || '?';
	}
</script>

<SettingsForm
	title="Planning"
	description="Fixed size-to-time estimates, the cycle shape, and the people whose net hours planning may fill."
	form={form as SettingsFormResult | null}
	{payload}
>
	<Card.Root>
		<Card.Header>
			<Card.Title>Estimates and cycle</Card.Title>
			<Card.Description>
				Changing the size map re-prices every planned issue. The allocation keeps the rest of the
				week free for reviews, unplanned work and slack.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<div class="grid gap-4 sm:grid-cols-3">
				<Field.Field>
					<Field.Label>Small (hours)</Field.Label>
					<Input type="number" min="0" step="0.25" bind:value={sizeSm} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Medium (hours)</Field.Label>
					<Input type="number" min="0" step="0.25" bind:value={sizeMd} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Large (hours)</Field.Label>
					<Input type="number" min="0" step="0.25" bind:value={sizeLg} />
				</Field.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-3">
				<Field.Field>
					<Field.Label>Allocation (%)</Field.Label>
					<Input type="number" min="1" max="100" bind:value={allocationPercent} />
					<Field.Description>The share of net hours planning may fill (1–100).</Field.Description>
				</Field.Field>
				<Field.Field>
					<Field.Label>Cycle length (weeks)</Field.Label>
					<Input type="number" min="1" max="52" bind:value={cycleWeeks} />
					<Field.Description>Contiguous weeks per planning cycle (1–52).</Field.Description>
				</Field.Field>
				<Field.Field>
					<Field.Label>Cycle anchor</Field.Label>
					<Input type="date" bind:value={cycleAnchor} />
					<Field.Description>Must be a Monday; anchors the cycle numbering.</Field.Description>
				</Field.Field>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Working hours</Card.Title>
			<Card.Description>
				The default day window for every viewer without personal availability, and the prefill for
				Settings → Availability.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Field>
					<Field.Label>Timezone</Field.Label>
					<Input bind:value={timezone} placeholder="Europe/Berlin" />
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
					<Field.Description>Local wall time the working day starts.</Field.Description>
				</Field.Field>
				<Field.Field>
					<Field.Label>End time</Field.Label>
					<Input type="time" bind:value={endTime} />
					<Field.Description>Local wall time the working day ends.</Field.Description>
				</Field.Field>
			</div>

			<Field.Field>
				<Field.Label>Work days</Field.Label>
				<div class="flex flex-wrap gap-2">
					{#each WORKDAYS as day (day.value)}
						<label
							class="flex items-center gap-1.5 rounded-xs border border-[color:var(--border)] px-2 py-1 text-xs"
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
			<Card.Title>Maintainers</Card.Title>
			<Card.Description>
				One row per mirrored forge person. Hours are entered as decimal hours and stored as
				minutes.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<p class="text-muted-foreground text-xs leading-relaxed">
				Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.
			</p>

			{#if roster.length === 0}
				<p class="text-muted-foreground text-xs">
					No maintainers yet. Add someone from the candidates below.
				</p>
			{:else}
				<ul class="flex flex-col divide-y divide-[color:var(--border)]">
					{#each roster as row, index (`${row.forge}:${row.instance}:${row.external_id}`)}
						<li class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
							<Avatar.Root class="size-8 shrink-0">
								{#if row.avatar_url}
									<Avatar.Image src={row.avatar_url} alt={row.login} />
								{/if}
								<Avatar.Fallback>{initial(row.login)}</Avatar.Fallback>
							</Avatar.Root>

							<span class="min-w-0 flex-1 truncate text-sm">@{row.login}</span>

							<Field.Field class="w-28">
								<Field.Label class="sr-only">Weekly hours for @{row.login}</Field.Label>
								<Input
									type="number"
									min="0"
									step="0.25"
									aria-label={`Weekly net hours for ${row.login}`}
									bind:value={row.hours}
								/>
							</Field.Field>

							<label class="flex items-center gap-1.5 text-xs">
								<input type="checkbox" class="size-3.5 accent-foreground" bind:checked={row.active} />
								Active
							</label>

							<Button
								variant="ghost"
								size="sm"
								onclick={() => removeMaintainer(index)}
								aria-label={`Remove ${row.login}`}
							>
								Remove
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Add a maintainer</Card.Title>
			<Card.Description>
				Candidates are the assignable users of the configured repositories.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if available.length === 0}
				<p class="text-muted-foreground text-xs">
					Every assignable user is already on the roster.
				</p>
			{:else}
				<ul class="flex flex-col divide-y divide-[color:var(--border)]">
					{#each available as candidate (`${candidate.forge}:${candidate.instance}:${candidate.externalId}`)}
						<li class="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
							<Avatar.Root class="size-7 shrink-0">
								{#if candidate.avatarUrl}
									<Avatar.Image src={candidate.avatarUrl} alt={candidate.login} />
								{/if}
								<Avatar.Fallback>{initial(candidate.login)}</Avatar.Fallback>
							</Avatar.Root>
							<span class="min-w-0 flex-1 truncate text-sm">@{candidate.login}</span>
							<Button variant="outline" size="sm" onclick={() => addMaintainer(candidate)}>
								Add
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</SettingsForm>
