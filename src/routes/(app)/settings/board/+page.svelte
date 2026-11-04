<script lang="ts">
	import { untrack } from 'svelte';
	import { FormGroup, Input, Label } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import { STATUS_OPTIONS } from '#lib/labels';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const wipStages = untrack(() => data.wipStages);
	const wipLabels = new Map(STATUS_OPTIONS.map((option) => [option.value, option.label]));
	const stageLabel = (stage: string): string => wipLabels.get(stage) ?? 'Unknown stage';
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

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="Done column"
		description="Issues that moved to Done longer ago than this window are hidden from the board."
	>
		<FormGroup spacing="">
			<Label for="board-done-days">Done retention (days)</Label>
			<Input id="board-done-days" type="number" min="0" bind:value={doneDays} />
		</FormGroup>
	</Section>

	<Section
		title="Work in progress"
		description="Optional caps per stage. Leave a cap blank for no limit; Done is never capped."
	>
		<div class="row g-3">
			{#each wipStages as stage (stage)}
				<div class="col-sm-4">
					<FormGroup spacing="">
						<Label for={`board-wip-${stage}`}>{stageLabel(stage)}</Label>
						<Input
							id={`board-wip-${stage}`}
							type="number"
							min="0"
							placeholder="No limit"
							bind:value={wipLimits[stage]}
						/>
					</FormGroup>
				</div>
			{/each}
		</div>
	</Section>
</SettingsForm>
