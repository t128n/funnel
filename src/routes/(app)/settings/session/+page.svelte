<script lang="ts">
	import { untrack } from 'svelte';
	import * as Card from '#lib/components/ui/card';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let idleDays = $state<number | null>(untrack(() => data.session.idle_days));

	const payload = $derived(JSON.stringify({ session: { idle_days: idleDays } }));
</script>

<SettingsForm
	title="Session"
	description="How long a signed-in session lasts. Applied to sessions created after a restart."
	form={form as SettingsFormResult | null}
	{payload}
>
	<Card.Root>
		<Card.Content class="pt-6">
			<Field.Field class="max-w-[12rem]">
				<Field.Label>Idle lifetime (days)</Field.Label>
				<Input type="number" min="0" bind:value={idleDays} />
			</Field.Field>
		</Card.Content>
	</Card.Root>
</SettingsForm>
