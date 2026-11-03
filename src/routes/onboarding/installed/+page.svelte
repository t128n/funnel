<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
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
	description={data.installed
		? 'Pick the repositories Funnel should mirror.'
		: 'Install the GitHub App first, then return here.'}
/>

<FocusedShell>
	<div class="d-flex flex-column gap-2">
		<h1 class="h4 fw-semibold mb-0">
			{data.installed ? 'Funnel Is Ready' : 'Installation Required'}
		</h1>
		<p class="measure text-body-secondary mb-0">
			{#if data.installed}
				Choose the repositories Funnel should mirror. You can change this any time in Settings →
				Repositories.
			{:else}
				Install <strong class="fw-semibold text-body">{data.appName}</strong> on GitHub first, then
				return here.
			{/if}
		</p>
	</div>

	<OnboardingSteps active={3} />

	{#if !data.installed}
		<section class="min-w-0 w-100 border-top pt-4">
			<h2 class="h5 fw-semibold mb-0">Installation</h2>
			<p class="mt-1 mb-0 text-body-secondary">
				Funnel cannot see the installation yet. Finish the GitHub install step, then come back to
				this page.
			</p>
			<div class="mt-4">
				<Button color="primary" href={data.installUrl}>
					<i class="bi bi-box-arrow-up-right me-1" aria-hidden="true"></i>
					Install on GitHub
				</Button>
			</div>
		</section>
	{:else}
		<form method="POST" action="?/save" class="d-flex flex-column gap-4">
			<section class="min-w-0 w-100 border-top pt-4">
				<h2 class="h5 fw-semibold mb-0">Repositories</h2>
				<div class="mt-1 d-flex flex-wrap align-items-baseline justify-content-between gap-2">
					<p class="mb-0 text-body-secondary">
						Owner: <span class="font-monospace">{data.ownerLogin}</span>
					</p>
					<span class="small text-body-secondary">
						{data.repos.length} available · {selected.length} selected
					</span>
				</div>

				{#if data.error}
					<InlineStatus tone="error" message={data.error} class="mt-4" />
				{/if}

				{#if data.repos.length === 0}
					<p class="mt-4 mb-0 text-body-secondary">
						This installation has no repositories yet.
					</p>
				{:else}
					<div class="mt-4 d-flex justify-content-end">
						<Button type="button" color="outline-secondary" onclick={toggleAll}>
							{allSelected ? 'Clear All' : 'Select All'}
						</Button>
					</div>
					<ul class="list-unstyled mt-2 mb-0 border-top">
						{#each data.repos as repo (repo.fullName)}
							<li class="border-bottom">
								<label
									class="form-check d-flex align-items-center gap-2 py-2 mb-0 ps-0"
									style="min-height: var(--funnel-row-compact)"
								>
									<input
										type="checkbox"
										name="repos"
										value={repo.fullName}
										bind:group={selected}
										class="form-check-input flex-shrink-0 m-0"
									/>
									<span class="font-monospace min-w-0 flex-grow-1 text-truncate">{repo.fullName}</span>
									{#if repo.private}
										<span class="small text-body-secondary">Private</span>
									{/if}
									{#if repo.archived}
										<span class="small text-body-secondary">Archived</span>
									{/if}
								</label>
							</li>
						{/each}
					</ul>
				{/if}

				<footer class="mt-4 d-flex justify-content-end border-top pt-4">
					<Button type="submit" color="primary" disabled={selected.length === 0}>
						Save and Continue
					</Button>
				</footer>
			</section>
		</form>
	{/if}
</FocusedShell>
