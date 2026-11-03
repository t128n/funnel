<script lang="ts">
	import { untrack } from 'svelte';
	import {
		Button,
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle,
		Input,
		Table
	} from '@sveltestrap/sveltestrap';
	import ConfirmDialog from '#lib/components/settings/confirm-dialog.svelte';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type ProjectRow = { label: string; name: string };

	const initial = untrack(() =>
		data.projects.map((entry) => ({ label: entry.label, name: entry.name ?? '' }))
	);
	let projects = $state<ProjectRow[]>(initial);
	let removeIndex = $state<number | null>(null);
	let confirmOpen = $state(false);

	const payload = $derived(
		JSON.stringify({
			projects: projects
				.filter((row) => row.label.trim().length > 0)
				.map((row) => ({ label: row.label.trim(), name: row.name.trim() || undefined }))
		})
	);

	const removingLabel = $derived(
		removeIndex !== null && projects[removeIndex]?.label.trim()
			? projects[removeIndex].label.trim()
			: 'this project'
	);

	function addProject() {
		projects = [...projects, { label: '', name: '' }];
	}

	function requestRemove(index: number) {
		removeIndex = index;
		confirmOpen = true;
	}

	function removeProject() {
		if (removeIndex === null) return;
		projects = projects.filter((_, index) => index !== removeIndex);
		removeIndex = null;
	}
</script>

<SettingsForm
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="Projects"
		description="GitHub labels that mark an issue as belonging to a project; enables the Project group-by option in the issue feeds. The name defaults to the label."
	>
		<Table responsive hover class="align-middle">
			<colgroup>
				<col />
				<col />
				<col style="width:5rem" />
			</colgroup>
			<thead>
				<tr>
					<th scope="col">Label</th>
					<th scope="col">Name</th>
					<th scope="col">
						<span class="visually-hidden">Actions</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{#if projects.length === 0}
					<tr>
						<td class="text-body-secondary" colspan="3">No projects yet.</td>
					</tr>
				{:else}
					{#each projects as _, index (index)}
						<tr>
							<td>
								<Input
									bind:value={projects[index].label}
									aria-label={`Project label ${index + 1}`}
									placeholder="project1"
									autocomplete="off"
									spellcheck="false"
									bsSize="sm"
								/>
							</td>
							<td>
								<Input
									bind:value={projects[index].name}
									aria-label={`Project name ${index + 1}`}
									placeholder="Project One"
									autocomplete="off"
									bsSize="sm"
								/>
							</td>
							<td class="text-end">
								<Dropdown>
									<DropdownToggle
										color="link"
										size="sm"
										class="px-1 py-0 text-secondary"
										aria-label={`Actions for project ${index + 1}`}
									>
										<i class="bi bi-three-dots" aria-hidden="true"></i>
									</DropdownToggle>
									<DropdownMenu end>
										<DropdownItem on:click={() => requestRemove(index)}>
											<i class="bi bi-trash me-2" aria-hidden="true"></i>
											Remove project
										</DropdownItem>
									</DropdownMenu>
								</Dropdown>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</Table>

		<div>
			<Button type="button" color="outline-secondary" onclick={addProject}>
				<i class="bi bi-plus-lg me-2" aria-hidden="true"></i>
				Add Project
			</Button>
		</div>
	</Section>
</SettingsForm>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Remove Project"
	description={`Remove ${removingLabel} from the configured list? The change takes effect when you save.`}
	confirmLabel="Remove Project"
	onconfirm={removeProject}
/>
