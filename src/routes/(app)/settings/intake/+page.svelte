<script lang="ts">
	import { untrack } from 'svelte';
	import * as Card from '#lib/components/primitives/card';
	import * as Field from '#lib/components/primitives/field';
	import * as NativeSelect from '#lib/components/primitives/native-select';
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
	title="Intake"
	description="Where accepted submissions go by default. Must be one of the configured repositories."
	form={form as SettingsFormResult | null}
	{payload}
>
	<Card.Root>
		<Card.Content>
			<Field.Field class="max-w-sm">
				<Field.Label>Default repository</Field.Label>
				<NativeSelect.Root bind:value={defaultRepo}>
					<NativeSelect.Option value="">First repository</NativeSelect.Option>
					{#each repoOptions as repo (repo)}
						<NativeSelect.Option value={repo}>{repo}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
		</Card.Content>
	</Card.Root>
</SettingsForm>
