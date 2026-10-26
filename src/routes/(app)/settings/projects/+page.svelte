<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/primitives/button';
	import * as Card from '#lib/components/primitives/card';
	import * as Field from '#lib/components/primitives/field';
	import { Input } from '#lib/components/primitives/input';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type ProjectRow = { label: string; name: string };

	const initial = untrack(() =>
		data.projects.map((entry) => ({ label: entry.label, name: entry.name }))
	);
	let projects = $state<ProjectRow[]>(initial);

	const payload = $derived(
		JSON.stringify({
			projects: projects
				.filter((row) => row.label.trim().length > 0)
				.map((row) => ({ label: row.label.trim(), name: row.name.trim() || undefined }))
		})
	);

	function addProject() {
		projects = [...projects, { label: '', name: '' }];
	}
</script>

<SettingsForm
	title="Projects"
	description="GitHub labels that mark an issue as belonging to a project; enables the “Project” group-by option in the issue feeds. The name defaults to the label."
	form={form as SettingsFormResult | null}
	{payload}
>
	<Card.Root>
		<Card.Content class="flex flex-col gap-3 pt-6">
			{#each projects as _, index (index)}
				<div class="flex items-end gap-2">
					<Field.Field class="flex-1">
						<Field.Label class={index === 0 ? '' : 'sr-only'}>Label {index + 1}</Field.Label>
						<Input
							bind:value={projects[index].label}
							placeholder="project1"
							autocomplete="off"
							spellcheck="false"
						/>
					</Field.Field>
					<Field.Field class="flex-1">
						<Field.Label class={index === 0 ? '' : 'sr-only'}>Name</Field.Label>
						<Input bind:value={projects[index].name} placeholder="Project One" autocomplete="off" />
					</Field.Field>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Remove project"
						onclick={() => (projects = projects.filter((__, i) => i !== index))}
					>
						<Trash2Icon />
					</Button>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" class="self-start" onclick={addProject}>
				<PlusIcon />
				Add project
			</Button>
		</Card.Content>
	</Card.Root>
</SettingsForm>
