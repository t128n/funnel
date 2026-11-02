<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '#lib/components/ui/button';
	import OnboardingSteps from '#lib/components/onboarding/onboarding-steps.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let selected = $state<string[]>([]);

	const allSelected = $derived(
		data.repos.length > 0 && selected.length === data.repos.length
	);

	function toggleAll() {
		selected = allSelected ? [] : data.repos.map((repo) => repo.fullName);
	}
</script>

<PageHead
	title={data.installed ? 'Funnel Is Ready' : 'Installation Required'}
	description={
		data.installed
			? 'Pick the repositories Funnel should mirror.'
			: 'Install the GitHub App first, then return here.'
	}
/>

<FocusedShell>
	<div class="flex flex-col gap-2">
		<h1 class="text-heading-md font-semibold leading-heading-md text-fg">
			{data.installed ? 'Funnel Is Ready' : 'Installation Required'}
		</h1>
		<p class="max-w-[var(--layout-measure)] text-body leading-body text-fg-secondary">
			{#if data.installed}
				Choose the repositories Funnel should mirror. You can change this any time in Settings →
				Repositories.
			{:else}
				Install <strong class="font-semibold text-fg">{data.appName}</strong> on GitHub first, then
				return here.
			{/if}
		</p>
	</div>

	<OnboardingSteps active={3} />

	{#if !data.installed}
		<section class="min-w-0 w-full border-t border-border-subtle pt-4">
			<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Installation</h2>
			<p class="mt-1 text-body leading-body text-fg-secondary">
				Funnel cannot see the installation yet. Finish the GitHub install step, then come back to
				this page.
			</p>
			<div class="mt-4">
				<Button href={data.installUrl}>
					<ExternalLinkIcon />
					Install on GitHub
				</Button>
			</div>
		</section>
	{:else}
		<form method="POST" action="?/save" class="flex flex-col gap-4">
			<section class="min-w-0 w-full border-t border-border-subtle pt-4">
				<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Repositories</h2>
				<div class="mt-1 flex flex-wrap items-baseline justify-between gap-2">
					<p class="text-body leading-body text-fg-secondary">
						Owner: <span class="mono">{data.ownerLogin}</span>
					</p>
					<span class="text-caption text-fg-secondary">
						{data.repos.length} available · {selected.length} selected
					</span>
				</div>

				{#if data.error}
					<InlineStatus tone="error" message={data.error} class="mt-4" />
				{/if}

				{#if data.repos.length === 0}
					<p class="mt-4 text-body text-fg-secondary">
						This installation has no repositories yet.
					</p>
				{:else}
					<div class="mt-4 flex justify-end">
						<Button type="button" variant="outline" onclick={toggleAll}>
							{allSelected ? 'Clear All' : 'Select All'}
						</Button>
					</div>
					<ul class="mt-2 border-t border-border-subtle">
						{#each data.repos as repo (repo.fullName)}
							<li class="border-b border-border-subtle">
								<label class="flex min-h-(--size-row-default) cursor-pointer items-center gap-3 py-2">
									<input
										type="checkbox"
										name="repos"
										value={repo.fullName}
										bind:group={selected}
										class="size-4 shrink-0 accent-primary"
									/>
									<span class="mono min-w-0 flex-1 truncate">{repo.fullName}</span>
									{#if repo.private}
										<span class="text-caption text-fg-secondary">Private</span>
									{/if}
									{#if repo.archived}
										<span class="text-caption text-fg-secondary">Archived</span>
									{/if}
								</label>
							</li>
						{/each}
					</ul>
				{/if}

				<footer class="mt-4 flex justify-end border-t border-border-subtle pt-4">
					<Button type="submit" disabled={selected.length === 0}>Save and Continue</Button>
				</footer>
			</section>
		</form>
	{/if}
</FocusedShell>
