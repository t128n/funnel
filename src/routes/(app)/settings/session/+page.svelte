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

	const initial = untrack(() => data.session);
	let idleDays = $state<number | null>(initial.idle_days);

	const payload = $derived(JSON.stringify({ session: { idle_days: idleDays } }));
</script>

<SettingsForm
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="Session lifetime"
		description="Applied to sessions created after a restart."
	>
		<dl class="label-value">
			<dt>Status</dt>
			<dd>
				<span class="status status-success">
					<CircleCheckIcon aria-hidden="true" />
					Sign-in required
				</span>
			</dd>
			<dt>Idle lifetime</dt>
			<dd>{idleDays ?? '—'} days</dd>
		</dl>

		<Field.Field>
			<Field.Label for="session-idle-days">Idle lifetime (days)</Field.Label>
			<Input id="session-idle-days" type="number" min="0" bind:value={idleDays} />
		</Field.Field>
	</Section>
</SettingsForm>
