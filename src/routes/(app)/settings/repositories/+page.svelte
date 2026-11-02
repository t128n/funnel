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

<SettingsForm
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="GitHub host"
		description="Deploy-time configuration from the environment. Changing it requires editing GITHUB_URL / GITHUB_API_URL and restarting."
	>
		<dl class="label-value">
			<dt>Web URL</dt>
			<dd><span class="mono break-all">{data.host.url}</span></dd>
			<dt>API URL</dt>
			<dd><span class="mono break-all">{data.host.api_url}</span></dd>
		</dl>
	</Section>

	<Section
		title="Configured repositories"
		description="The shortcode is the project key shown on board cards (for example FIT-12). Leave it blank to derive it from the repository name."
	>
		<div class="overflow-x-auto">
			<table class="w-full table-fixed border-collapse text-body">
				<thead>
					<tr>
						<th
							class="h-9 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
						>
							Repository
						</th>
						<th
							class="h-9 w-28 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
						>
							Shortcode
						</th>
						<th class="h-9 w-10 border-b border-border-subtle bg-surface-2 px-1">
							<span class="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#if repos.length === 0}
						<tr>
							<td class="py-3 text-body text-fg-secondary" colspan="3">
								No repositories yet.
							</td>
						</tr>
					{:else}
						{#each repos as _, index (index)}
							<tr class="border-b border-border-subtle">
								<td class="py-1 pr-2">
									<Input
										bind:value={repos[index].repo}
										aria-label={`Repository ${index + 1}`}
										placeholder="owner/name"
										autocomplete="off"
										spellcheck="false"
										class="h-7"
									/>
								</td>
								<td class="py-1 pr-2">
									<Input
										bind:value={repos[index].shortcode}
										aria-label={`Shortcode for repository ${index + 1}`}
										placeholder="FIT"
										maxlength={6}
										autocomplete="off"
										spellcheck="false"
										class="h-7"
									/>
								</td>
								<td class="py-1 text-right">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger
											class="inline-flex size-(--size-control-sm) items-center justify-center rounded-sm text-fg-secondary hover:bg-surface-2"
											aria-label={`Actions for repository ${index + 1}`}
										>
											<EllipsisIcon class="size-4" aria-hidden="true" />
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end" class="w-56">
											<DropdownMenu.Item
												variant="destructive"
												onSelect={() => requestRemove(index)}
											>
												<Trash2Icon />
												Remove repository
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
			<Button type="button" variant="outline" onclick={addRepo}>
				<PlusIcon />
				Add Repository
			</Button>
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
