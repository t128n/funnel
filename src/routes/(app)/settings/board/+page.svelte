<script lang="ts">
	import { untrack } from 'svelte';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const wipStages = untrack(() => data.wipStages);
	let doneDays = $state<number | null>(untrack(() => data.board.done_days));
	let wipLimits = $state<Record<string, number | null>>(
		untrack(() =>
			Object.fromEntries(
				data.wipStages.map((stage) => [stage, data.board.wip_limits[stage] ?? null])
			)
		)
	);

	const payload = $derived(
		JSON.stringify({
			board: {
				done_days: doneDays,
				wip_limits: Object.fromEntries(
					Object.entries(wipLimits).filter(([, value]) => typeof value === 'number')
				)
			}
		})
	);
</script>

<SettingsForm
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="Done column"
		description="Issues that moved to Done longer ago than this window are hidden from the board."
	>
		<Field.Field>
			<Field.Label for="board-done-days">Done retention (days)</Field.Label>
			<Input id="board-done-days" type="number" min="0" bind:value={doneDays} />
		</Field.Field>
	</Section>

	<Section
		title="Work in progress"
		description="Optional caps per stage. Leave a cap blank for no limit; Done is never capped."
	>
		{#each wipStages as stage (stage)}
			<Field.Field>
				<Field.Label for={`board-wip-${stage}`} class="capitalize">{stage}</Field.Label>
				<Input
					id={`board-wip-${stage}`}
					type="number"
					min="0"
					placeholder="No limit"
					bind:value={wipLimits[stage]}
				/>
			</Field.Field>
		{/each}
	</Section>
</SettingsForm>
