<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, FormCheck, FormGroup, FormText, Input, Label, Table } from '@sveltestrap/sveltestrap';
	import ConfirmDialog from '#lib/components/settings/confirm-dialog.svelte';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import { hoursToMinutes, minutesToHours } from '#lib/planning';
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

	let sizeSm = $state<number | null>(minutesToHours(planning.size_minutes.sm));
	let sizeMd = $state<number | null>(minutesToHours(planning.size_minutes.md));
	let sizeLg = $state<number | null>(minutesToHours(planning.size_minutes.lg));
	let allocationPercent = $state<number | null>(planning.allocation_percent);
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
				// Cycle shape is retained in stored config for existing
				// instances, but the planner no longer exposes a cycle view.
				cycle_weeks: planning.cycle_weeks,
				cycle_anchor: planning.cycle_anchor,
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

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section title="Estimates" description="Changing the size map re-prices every planned issue.">
		<div class="row g-3">
			<div class="col-sm-4">
				<FormGroup spacing="">
					<Label for="planning-size-sm">Small (hours)</Label>
					<Input id="planning-size-sm" type="number" min="0" step="0.25" bind:value={sizeSm} />
				</FormGroup>
			</div>
			<div class="col-sm-4">
				<FormGroup spacing="">
					<Label for="planning-size-md">Medium (hours)</Label>
					<Input id="planning-size-md" type="number" min="0" step="0.25" bind:value={sizeMd} />
				</FormGroup>
			</div>
			<div class="col-sm-4">
				<FormGroup spacing="">
					<Label for="planning-size-lg">Large (hours)</Label>
					<Input id="planning-size-lg" type="number" min="0" step="0.25" bind:value={sizeLg} />
				</FormGroup>
			</div>
		</div>
	</Section>

	<Section
		title="Allocation"
		description="The share of net hours that commitments may fill. The rest stays free for reviews, unplanned work, and slack."
	>
		<div class="row g-3">
			<div class="col-sm-4">
				<FormGroup spacing="">
					<Label for="planning-allocation">Allocation (%)</Label>
					<Input
						id="planning-allocation"
						type="number"
						min="1"
						max="100"
						bind:value={allocationPercent}
					/>
					<FormText>Share of net hours planning may fill (1–100).</FormText>
				</FormGroup>
			</div>
		</div>
	</Section>

	<Section
		title="Maintainers"
		description="One row per mirrored forge person. Hours are entered as decimal hours and stored as minutes."
	>
		<p class="mb-0 text-body-secondary">
			Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.
		</p>

		{#if roster.length === 0}
			<p class="mb-0 text-body-secondary">No maintainers yet. Add someone below.</p>
		{:else}
			<Table responsive class="table-sm align-middle">
				<colgroup>
					<col />
					<col style="width:8rem" />
					<col style="width:6rem" />
					<col style="width:5rem" />
				</colgroup>
				<thead>
					<tr>
						<th scope="col">Person</th>
						<th scope="col">Hours</th>
						<th scope="col">Active</th>
						<th scope="col">
							<span class="visually-hidden">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each roster as row, index (`${row.forge}:${row.instance}:${row.external_id}`)}
						<tr>
							<td>
								<span class="text-truncate">@{row.login}</span>
							</td>
							<td>
								<Input
									id={`planning-maintainer-hours-${index}`}
									type="number"
									min="0"
									step="0.25"
									bsSize="sm"
									aria-label={`Weekly net hours for ${row.login}`}
									bind:value={row.hours}
								/>
							</td>
							<td>
								<FormCheck
									type="switch"
									class="mb-0"
									checked={row.active}
									on:change={(event) =>
										(row.active = (event.currentTarget as HTMLInputElement).checked)}
									aria-label={`Active for ${row.login}`}
								/>
							</td>
							<td class="text-end">
								<Button
									color="link"
									size="sm"
									class="p-0"
									aria-label={`Remove ${row.login}`}
									onclick={() => requestRemove(index)}
								>
									Remove
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</Table>
		{/if}
	</Section>

	<Section
		title="Add a maintainer"
		description="Candidates are the assignable users of the configured repositories."
	>
		{#if available.length === 0}
			<p class="mb-0 text-body-secondary">Every assignable user is already on the roster.</p>
		{:else}
			<ul class="list-unstyled mb-0">
				{#each available as candidate, index (`${candidate.forge}:${candidate.instance}:${candidate.externalId}`)}
					<li
						class="d-flex flex-wrap align-items-center gap-2 py-2 {index < available.length - 1
							? 'border-bottom'
							: ''}"
					>
						<span class="min-w-0 flex-grow-1 text-truncate">@{candidate.login}</span>
						<Button color="outline-secondary" size="sm" onclick={() => addMaintainer(candidate)}>
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
