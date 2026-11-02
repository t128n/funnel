<script lang="ts">
	import { untrack } from 'svelte';
	import * as Field from '#lib/components/ui/field';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const repoOptions = untrack(() => data.repos);
	let defaultRepo = $state(untrack(() => data.defaultRepo));

	const payload = $derived(
		JSON.stringify({ intake: { default_repo: defaultRepo.trim() || undefined } })
	);
</script>

<SettingsForm
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="Routing"
		description="Where accepted submissions go by default. Must be one of the configured repositories."
	>
		<Field.Field>
			<Field.Label for="intake-default-repo">Default repository</Field.Label>
			<NativeSelect.Root id="intake-default-repo" bind:value={defaultRepo}>
				<NativeSelect.Option value="">First repository</NativeSelect.Option>
				{#each repoOptions as repo (repo)}
					<NativeSelect.Option value={repo}>{repo}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</Field.Field>
	</Section>
</SettingsForm>
