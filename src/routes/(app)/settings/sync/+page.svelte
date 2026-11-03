<script lang="ts">
	import { untrack } from 'svelte';
	import { FormGroup, Input, Label } from '@sveltestrap/sveltestrap';
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

<SettingsForm
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="Current configuration"
		description="The active interval applies while someone has the cockpit open; the idle interval is the background cadence."
	>
		<dl class="property-list">
			<dt>Status</dt>
			<dd>
				<span class="d-inline-flex align-items-center gap-1 small text-success">
					<i class="bi bi-check-circle" aria-hidden="true"></i>
					Polling
				</span>
			</dd>
			<dt>History window</dt>
			<dd>{historyDays ?? '—'} days</dd>
			<dt>Active poll</dt>
			<dd>{activeSeconds ?? '—'} seconds</dd>
			<dt>Idle poll</dt>
			<dd>{idleSeconds ?? '—'} seconds</dd>
		</dl>
	</Section>

	<Section title="Polling intervals">
		<FormGroup class="mb-0">
			<Label for="sync-history-days">History window (days)</Label>
			<Input id="sync-history-days" type="number" min="0" bind:value={historyDays} />
		</FormGroup>
		<FormGroup class="mb-0">
			<Label for="sync-active-seconds">Active poll (seconds)</Label>
			<Input id="sync-active-seconds" type="number" min="0" bind:value={activeSeconds} />
		</FormGroup>
		<FormGroup class="mb-0">
			<Label for="sync-idle-seconds">Idle poll (seconds)</Label>
			<Input id="sync-idle-seconds" type="number" min="0" bind:value={idleSeconds} />
		</FormGroup>
	</Section>
</SettingsForm>
