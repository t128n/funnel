<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type RepoRow = { repo: string; shortcode: string };

	// One-time snapshot: an SSE-driven `refreshAll` must not clobber edits.
	const initial = untrack(() =>
		data.repos.map((entry) => ({ repo: entry.repo, shortcode: entry.shortcode }))
	);
	let repos = $state<RepoRow[]>(initial);

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

	function addRepo() {
		repos = [...repos, { repo: '', shortcode: '' }];
	}
</script>

<SettingsForm
	title="Repositories"
	description="Repositories Funnel mirrors and can create issues in. The shortcode is the project key shown on board cards (e.g. FIT-12); leave it blank to derive it from the repository name."
	form={form as SettingsFormResult | null}
	{payload}
>
	<Card.Root>
		<Card.Header>
			<Card.Title>GitHub host</Card.Title>
			<Card.Description>
				Deploy-time configuration from the environment. Changing it requires editing
				<code>FUNNEL_GITHUB_URL</code> / <code>FUNNEL_GITHUB_API_URL</code> and restarting.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4 sm:grid-cols-2">
			<Field.Field>
				<Field.Label>Web URL</Field.Label>
				<Input value={data.host.url} readonly />
			</Field.Field>
			<Field.Field>
				<Field.Label>API URL</Field.Label>
				<Input value={data.host.api_url} readonly />
			</Field.Field>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Configured repositories</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#each repos as _, index (index)}
				<div class="flex items-end gap-2">
					<Field.Field class="flex-1">
						<Field.Label class={index === 0 ? '' : 'sr-only'}>Repository {index + 1}</Field.Label>
						<Input
							bind:value={repos[index].repo}
							placeholder="owner/name"
							autocomplete="off"
							spellcheck="false"
						/>
					</Field.Field>
					<Field.Field class="w-32">
						<Field.Label class={index === 0 ? '' : 'sr-only'}>Shortcode</Field.Label>
						<Input
							bind:value={repos[index].shortcode}
							placeholder="FIT"
							maxlength={6}
							autocomplete="off"
							spellcheck="false"
						/>
					</Field.Field>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Remove repository"
						onclick={() => (repos = repos.filter((__, i) => i !== index))}
					>
						<Trash2Icon />
					</Button>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" class="self-start" onclick={addRepo}>
				<PlusIcon />
				Add repository
			</Button>
		</Card.Content>
	</Card.Root>
</SettingsForm>
