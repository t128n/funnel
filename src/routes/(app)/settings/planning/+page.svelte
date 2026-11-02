<script lang="ts">
	import { untrack } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Button } from '#lib/components/ui/button';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import * as Switch from '#lib/components/ui/switch';
	import ConfirmDialog from '#lib/components/settings/confirm-dialog.svelte';
	import Section from '#lib/components/settings/section.svelte';
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
	let removeIndex = $state<number | null>(null);
	let confirmOpen = $state(false);

	const rosterKeys = $derived(
		new Set(roster.map((row) => `${row.forge}:${row.instance}:${row.external_id}`))
	);
	const available = $derived(
		candidates.filter(
			(candidate) =>
				!rosterKeys.has(`${candidate.forge}:${candidate.instance}:${candidate.externalId}`)
		)
	);

	const removingLogin = $derived(
		removeIndex !== null && roster[removeIndex] ? `@${roster[removeIndex].login}` : 'this person'
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

	function requestRemove(index: number): void {
		removeIndex = index;
		confirmOpen = true;
	}

	function removeMaintainer(): void {
		if (removeIndex === null) return;
		roster = roster.filter((_, position) => position !== removeIndex);
		removeIndex = null;
	}
</script>

<SettingsForm
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="Estimates"
		description="Changing the size map re-prices every planned issue."
	>
		<Field.Field>
			<Field.Label for="planning-size-sm">Small (hours)</Field.Label>
			<Input id="planning-size-sm" type="number" min="0" step="0.25" bind:value={sizeSm} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="planning-size-md">Medium (hours)</Field.Label>
			<Input id="planning-size-md" type="number" min="0" step="0.25" bind:value={sizeMd} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="planning-size-lg">Large (hours)</Field.Label>
			<Input id="planning-size-lg" type="number" min="0" step="0.25" bind:value={sizeLg} />
		</Field.Field>
	</Section>

	<Section
		title="Cycle"
		description="The allocation keeps the rest of the week free for reviews, unplanned work, and slack."
	>
		<Field.Field>
			<Field.Label for="planning-allocation">Allocation (%)</Field.Label>
			<Input
				id="planning-allocation"
				type="number"
				min="1"
				max="100"
				bind:value={allocationPercent}
			/>
			<Field.Description>The share of net hours planning may fill (1–100).</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="planning-cycle-weeks">Cycle length (weeks)</Field.Label>
			<Input id="planning-cycle-weeks" type="number" min="1" max="52" bind:value={cycleWeeks} />
			<Field.Description>Contiguous weeks per planning cycle (1–52).</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="planning-cycle-anchor">Cycle anchor</Field.Label>
			<Input id="planning-cycle-anchor" type="date" bind:value={cycleAnchor} />
			<Field.Description>Must be a Monday; anchors the cycle numbering.</Field.Description>
		</Field.Field>
	</Section>

	<Section
		title="Working hours"
		description="The default day window for every viewer without personal availability, and the prefill for Settings → Availability."
	>
		<Field.Field>
			<Field.Label for="planning-timezone">Timezone</Field.Label>
			<Input id="planning-timezone" bind:value={timezone} placeholder="Europe/Berlin" />
			<Field.Description>An IANA zone, such as Europe/Berlin or UTC.</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="planning-buffer">Buffer (%)</Field.Label>
			<Input id="planning-buffer" type="number" min="0" max="90" bind:value={bufferPercent} />
			<Field.Description>The share of the work window reserved for slack (0–90).</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="planning-start">Start time</Field.Label>
			<Input id="planning-start" type="time" bind:value={startTime} />
			<Field.Description>Local wall time the working day starts.</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="planning-end">End time</Field.Label>
			<Input id="planning-end" type="time" bind:value={endTime} />
			<Field.Description>Local wall time the working day ends.</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label>Work days</Field.Label>
			<div class="flex flex-wrap gap-x-4 gap-y-2">
				{#each WORKDAYS as day (day.value)}
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
		title="Maintainers"
		description="One row per mirrored forge person. Hours are entered as decimal hours and stored as minutes."
	>
		<p class="text-body leading-body text-fg-secondary">
			Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.
		</p>

		{#if roster.length === 0}
			<p class="text-body text-fg-secondary">No maintainers yet. Add someone below.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-body">
					<thead>
						<tr>
							<th
								class="h-9 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
							>
								Person
							</th>
							<th
								class="h-9 w-24 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
							>
								Hours
							</th>
							<th
								class="h-9 w-20 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
							>
								Active
							</th>
							<th class="h-9 w-10 border-b border-border-subtle bg-surface-2 px-1">
								<span class="sr-only">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each roster as row, index (`${row.forge}:${row.instance}:${row.external_id}`)}
							<tr class="border-b border-border-subtle">
								<td class="py-2 pr-3">
									<span class="truncate">@{row.login}</span>
								</td>
								<td class="py-1 pr-3">
									<Input
										type="number"
										min="0"
										step="0.25"
										aria-label={`Weekly net hours for ${row.login}`}
										bind:value={row.hours}
										class="h-7"
									/>
								</td>
								<td class="py-1 pr-3">
									<Switch.Root
										checked={row.active}
										onCheckedChange={(next) => (row.active = next)}
										aria-label={`Active for ${row.login}`}
									/>
								</td>
								<td class="py-1 text-right">
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={`Remove ${row.login}`}
										onclick={() => requestRemove(index)}
									>
										<Trash2Icon />
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Section>

	<Section
		title="Add a maintainer"
		description="Candidates are the assignable users of the configured repositories."
	>
		{#if available.length === 0}
			<p class="text-body text-fg-secondary">Every assignable user is already on the roster.</p>
		{:else}
			<ul class="border-t border-border-subtle">
				{#each available as candidate (`${candidate.forge}:${candidate.instance}:${candidate.externalId}`)}
					<li
						class="flex flex-wrap items-center gap-3 border-b border-border-subtle py-2"
					>
						<span class="min-w-0 flex-1 truncate text-body">@{candidate.login}</span>
						<Button variant="outline" onclick={() => addMaintainer(candidate)}>
							<PlusIcon />
							Add
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Section>
</SettingsForm>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Remove Maintainer"
	description={`Remove ${removingLogin} from the planning roster? Their planned hours stop counting when you save.`}
	confirmLabel="Remove Maintainer"
	onconfirm={removeMaintainer}
/>
