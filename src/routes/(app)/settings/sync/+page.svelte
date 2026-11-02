<script lang="ts">
	import { untrack } from 'svelte';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
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
		<dl class="label-value">
			<dt>Status</dt>
			<dd>
				<span class="status status-success">
					<CircleCheckIcon aria-hidden="true" />
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
		<Field.Field>
			<Field.Label for="sync-history-days">History window (days)</Field.Label>
			<Input id="sync-history-days" type="number" min="0" bind:value={historyDays} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="sync-active-seconds">Active poll (seconds)</Field.Label>
			<Input id="sync-active-seconds" type="number" min="0" bind:value={activeSeconds} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="sync-idle-seconds">Idle poll (seconds)</Field.Label>
			<Input id="sync-idle-seconds" type="number" min="0" bind:value={idleSeconds} />
		</Field.Field>
	</Section>
</SettingsForm>
