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

	type RepoRow = { repo: string; shortcode: string };

	// One-time snapshot: an SSE-driven `refreshAll` must not clobber edits.
	const initial = untrack(() =>
		data.repos.map((entry) => ({ repo: entry.repo, shortcode: entry.shortcode ?? '' }))
	);
	let repos = $state<RepoRow[]>(initial);
	let removeIndex = $state<number | null>(null);
	let confirmOpen = $state(false);

	const payload = $derived(
		JSON.stringify({
			repos: repos
				.filter((row) => row.repo.trim().length > 0)
				.map((row) => ({
					repo: row.repo.trim(),
					shortcode: row.shortcode.trim() || undefined
				}))
		})
	);

	const removingLabel = $derived(
		removeIndex !== null && repos[removeIndex]?.repo.trim()
			? repos[removeIndex].repo.trim()
			: 'this repository'
	);

	function addRepo() {
		repos = [...repos, { repo: '', shortcode: '' }];
	}

	function requestRemove(index: number) {
		removeIndex = index;
		confirmOpen = true;
	}

	function removeRepo() {
		if (removeIndex === null) return;
		repos = repos.filter((_, index) => index !== removeIndex);
		removeIndex = null;
	}
</script>

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="GitHub host"
		description="Deploy-time configuration from the environment. Changing it requires editing GITHUB_URL / GITHUB_API_URL and restarting."
	>
		<dl class="property-list">
			<dt>Web URL</dt>
			<dd><span class="font-monospace text-break">{data.host.url}</span></dd>
			<dt>API URL</dt>
			<dd><span class="font-monospace text-break">{data.host.api_url}</span></dd>
		</dl>
	</Section>

	<Section
		title="Configured repositories"
		description="The shortcode is the project key shown on board cards (for example FIT-12). Leave it blank to derive it from the repository name."
	>
		<Table responsive class="table-sm align-middle">
			<colgroup>
				<col />
				<col style="width:9rem" />
				<col style="width:5rem" />
			</colgroup>
			<thead>
				<tr>
					<th scope="col">Repository</th>
					<th scope="col">Shortcode</th>
					<th scope="col">
						<span class="visually-hidden">Actions</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{#if repos.length === 0}
					<tr>
						<td class="text-body-secondary" colspan="3">No repositories yet.</td>
					</tr>
				{:else}
					{#each repos as _, index (index)}
						<tr>
							<td>
								<Input
									bind:value={repos[index].repo}
									aria-label={`Repository ${index + 1}`}
									placeholder="owner/name"
									autocomplete="off"
									spellcheck="false"
									bsSize="sm"
								/>
							</td>
							<td>
								<Input
									bind:value={repos[index].shortcode}
									aria-label={`Shortcode for repository ${index + 1}`}
									placeholder="FIT"
									maxlength={6}
									autocomplete="off"
									spellcheck="false"
									bsSize="sm"
								/>
							</td>
							<td class="text-end">
								<Dropdown>
									<DropdownToggle
										color="link"
										size="sm"
										class="p-0"
										aria-label={`Actions for repository ${index + 1}`}
									>
										<i class="bi bi-three-dots" aria-hidden="true"></i>
									</DropdownToggle>
									<DropdownMenu end>
										<DropdownItem on:click={() => requestRemove(index)}>
											Remove repository
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
			<Button type="button" color="outline-secondary" onclick={addRepo}>Add repository</Button>
		</div>
	</Section>
</SettingsForm>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Remove Repository"
	description={`Remove ${removingLabel} from the configured list? The change takes effect when you save.`}
	confirmLabel="Remove Repository"
	onconfirm={removeRepo}
/>
