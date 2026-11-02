<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import { Input } from '#lib/components/ui/input';
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
		<div class="overflow-x-auto">
			<table class="w-full table-fixed border-collapse text-body">
				<thead>
					<tr>
						<th
							class="h-9 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
						>
							Label
						</th>
						<th
							class="h-9 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
						>
							Name
						</th>
						<th class="h-9 w-10 border-b border-border-subtle bg-surface-2 px-1">
							<span class="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#if projects.length === 0}
						<tr>
							<td class="py-3 text-body text-fg-secondary" colspan="3">No projects yet.</td>
						</tr>
					{:else}
						{#each projects as _, index (index)}
							<tr class="border-b border-border-subtle">
								<td class="py-1 pr-2">
									<Input
										bind:value={projects[index].label}
										aria-label={`Project label ${index + 1}`}
										placeholder="project1"
										autocomplete="off"
										spellcheck="false"
										class="h-7"
									/>
								</td>
								<td class="py-1 pr-2">
									<Input
										bind:value={projects[index].name}
										aria-label={`Project name ${index + 1}`}
										placeholder="Project One"
										autocomplete="off"
										class="h-7"
									/>
								</td>
								<td class="py-1 text-right">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger
											class="inline-flex size-(--size-control-sm) items-center justify-center rounded-sm text-fg-secondary hover:bg-surface-2"
											aria-label={`Actions for project ${index + 1}`}
										>
											<EllipsisIcon class="size-4" aria-hidden="true" />
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end" class="w-56">
											<DropdownMenu.Item
												variant="destructive"
												onSelect={() => requestRemove(index)}
											>
												<Trash2Icon />
												Remove project
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<div>
			<Button type="button" variant="outline" onclick={addProject}>
				<PlusIcon />
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
