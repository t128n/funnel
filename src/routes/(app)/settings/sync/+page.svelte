<script lang="ts">
	import { untrack } from 'svelte';
	import * as Card from '#lib/components/primitives/card';
	import * as Field from '#lib/components/primitives/field';
	import { Input } from '#lib/components/primitives/input';
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
	title="Sync"
	description="How often Funnel polls GitHub for changes. The active interval applies while someone has the cockpit open; the idle interval is the background cadence."
	form={form as SettingsFormResult | null}
	{payload}
>
	<Card.Root>
		<Card.Content class="grid gap-4 pt-6 sm:grid-cols-3">
			<Field.Field>
				<Field.Label>History window (days)</Field.Label>
				<Input type="number" min="0" bind:value={historyDays} />
			</Field.Field>
			<Field.Field>
				<Field.Label>Active poll (seconds)</Field.Label>
				<Input type="number" min="0" bind:value={activeSeconds} />
			</Field.Field>
			<Field.Field>
				<Field.Label>Idle poll (seconds)</Field.Label>
				<Input type="number" min="0" bind:value={idleSeconds} />
			</Field.Field>
		</Card.Content>
	</Card.Root>
</SettingsForm>
