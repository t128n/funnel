<script lang="ts">
	import { untrack } from 'svelte';
	import { FormGroup, FormText, Input, Label } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const initial = untrack(() => data.sync);
	let historyDays = $state<number | null>(initial.history_days);
	let activeSeconds = $state<number | null>(initial.poll_interval_active_seconds);
	let idleSeconds = $state<number | null>(initial.poll_interval_idle_seconds);

	const payload = $derived(
		JSON.stringify({
			sync: {
				history_days: historyDays,
				poll_interval_active_seconds: activeSeconds,
				poll_interval_idle_seconds: idleSeconds
			}
		})
	);
</script>

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="Polling intervals"
		description="The active interval applies while someone has the cockpit open; the idle interval is the background cadence."
	>
		<div class="row g-3">
			<div class="col-sm-4">
				<FormGroup spacing="">
					<Label for="sync-history-days">History window (days)</Label>
					<Input id="sync-history-days" type="number" min="0" bind:value={historyDays} />
					<FormText>How far back Funnel mirrors issue history.</FormText>
				</FormGroup>
			</div>
			<div class="col-sm-4">
				<FormGroup spacing="">
					<Label for="sync-active-seconds">Active poll (seconds)</Label>
					<Input id="sync-active-seconds" type="number" min="0" bind:value={activeSeconds} />
					<FormText>Cadence while the cockpit is open.</FormText>
				</FormGroup>
			</div>
			<div class="col-sm-4">
				<FormGroup spacing="">
					<Label for="sync-idle-seconds">Idle poll (seconds)</Label>
					<Input id="sync-idle-seconds" type="number" min="0" bind:value={idleSeconds} />
					<FormText>Background cadence with no viewers.</FormText>
				</FormGroup>
			</div>
		</div>
	</Section>
</SettingsForm>
