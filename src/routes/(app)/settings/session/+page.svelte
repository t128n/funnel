<script lang="ts">
	import { untrack } from 'svelte';
	import { FormGroup, FormText, Input, Label } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const initial = untrack(() => data.session);
	let idleDays = $state<number | null>(initial.idle_days);

	const payload = $derived(JSON.stringify({ session: { idle_days: idleDays } }));
</script>

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="Session lifetime"
		description="Applied to sessions created after a restart."
	>
		<FormGroup spacing="">
			<Label for="session-idle-days">Idle lifetime (days)</Label>
			<Input id="session-idle-days" type="number" min="0" bind:value={idleDays} />
			<FormText>Days without activity before signing in is required again.</FormText>
		</FormGroup>
	</Section>
</SettingsForm>
