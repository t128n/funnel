<script lang="ts">
	import { untrack } from 'svelte';
	import * as Card from '#lib/components/ui/card';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
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
	title="Board"
	description="The Done-column retention window and optional per-stage Work-in-Progress caps. Leave a cap blank for no limit; Done is never capped."
	form={form as SettingsFormResult | null}
	{payload}
>
	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			<Field.Field class="max-w-[12rem]">
				<Field.Label>Done retention (days)</Field.Label>
				<Input type="number" min="0" bind:value={doneDays} />
			</Field.Field>
			<div class="grid gap-4 sm:grid-cols-4">
				{#each wipStages as stage (stage)}
					<Field.Field>
						<Field.Label class="capitalize">{stage}</Field.Label>
						<Input type="number" min="0" placeholder="No limit" bind:value={wipLimits[stage]} />
					</Field.Field>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</SettingsForm>
