<script lang="ts">
	import { untrack } from 'svelte';
	import { FormGroup, Input, Label } from '@sveltestrap/sveltestrap';
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
		<dl class="property-list">
			<dt>Status</dt>
			<dd>
				<span class="d-inline-flex align-items-center gap-1 small text-success">
					<i class="bi bi-check-circle" aria-hidden="true"></i>
					Sign-in required
				</span>
			</dd>
			<dt>Idle lifetime</dt>
			<dd>{idleDays ?? '—'} days</dd>
		</dl>

		<FormGroup class="mb-0">
			<Label for="session-idle-days">Idle lifetime (days)</Label>
			<Input id="session-idle-days" type="number" min="0" bind:value={idleDays} />
		</FormGroup>
	</Section>
</SettingsForm>
