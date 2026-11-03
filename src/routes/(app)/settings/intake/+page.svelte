<script lang="ts">
	import { untrack } from 'svelte';
	import { FormGroup, FormText, Input, Label } from '@sveltestrap/sveltestrap';
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

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="Routing"
		description="Where accepted submissions go by default. Must be one of the configured repositories."
	>
		<FormGroup spacing="">
			<Label for="intake-default-repo">Default repository</Label>
			<Input type="select" id="intake-default-repo" bind:value={defaultRepo}>
				<option value="">First repository</option>
				{#each repoOptions as repo (repo)}
					<option value={repo}>{repo}</option>
				{/each}
			</Input>
			<FormText>The first configured repository is used when no default is set.</FormText>
		</FormGroup>
	</Section>
</SettingsForm>
