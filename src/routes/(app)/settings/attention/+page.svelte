<script lang="ts">
	import { untrack } from 'svelte';
	import { FormGroup, FormText, Input, Label } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const initial = untrack(() => data.attention);
	let firstResponseDays = $state<number | null>(initial.first_response_days);
	let staleOpenDays = $state<number | null>(initial.stale_open_days);
	let recheckCadenceDays = $state<number | null>(initial.recheck_cadence_days);
	let waitingDays = $state<number | null>(initial.waiting_days);

	const payload = $derived(
		JSON.stringify({
			attention: {
				first_response_days: firstResponseDays,
				stale_open_days: staleOpenDays,
				recheck_cadence_days: recheckCadenceDays,
				waiting_days: waitingDays
			}
		})
	);
</script>

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="Triage rules"
		description="Thresholds that surface issues in Attention and notify their assignees. Set a rule to 0 to disable it."
	>
		<div class="row g-3">
			<div class="col-sm-6">
				<FormGroup spacing="">
					<Label for="attention-first-response-days">First response (days)</Label>
					<Input
						id="attention-first-response-days"
						type="number"
						min="0"
						bind:value={firstResponseDays}
					/>
					<FormText>
						Raise a breach when an open issue has no comment from anyone other than its
						author after this many days. 0 disables the rule.
					</FormText>
				</FormGroup>
			</div>
			<div class="col-sm-6">
				<FormGroup spacing="">
					<Label for="attention-stale-open-days">Stale open (days)</Label>
					<Input
						id="attention-stale-open-days"
						type="number"
						min="0"
						bind:value={staleOpenDays}
					/>
					<FormText>
						Raise a breach when an open issue has not been updated for this many days. 0
						disables the rule.
					</FormText>
				</FormGroup>
			</div>
			<div class="col-sm-6">
				<FormGroup spacing="">
					<Label for="attention-recheck-cadence-days">Re-check cadence (days)</Label>
					<Input
						id="attention-recheck-cadence-days"
						type="number"
						min="0"
						bind:value={recheckCadenceDays}
					/>
					<FormText>
						Raise a breach when a blocked issue's re-check date is more than this many days
						overdue. 0 disables the rule.
					</FormText>
				</FormGroup>
			</div>
			<div class="col-sm-6">
				<FormGroup spacing="">
					<Label for="attention-waiting-days">Waiting (days)</Label>
					<Input
						id="attention-waiting-days"
						type="number"
						min="0"
						bind:value={waitingDays}
					/>
					<FormText>
						Raise a breach when an issue has been waiting on someone else for longer than
						this many calendar days. 0 disables the rule.
					</FormText>
				</FormGroup>
			</div>
		</div>
	</Section>
</SettingsForm>
