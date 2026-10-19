<script lang="ts">
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Badge } from '#lib/components/ui/badge';
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
	title="Choose repositories"
	description="Pick the repositories Funnel should mirror."
/>

<main class="bg-background flex min-h-svh flex-col items-center justify-center p-6">
	<div class="w-full max-w-lg">
		<div class="mb-6 flex flex-col items-center gap-3 text-center">
			<FunnelIcon class="size-9" />
			<h1 class="text-xl font-medium">Choose repositories</h1>
			<p class="text-muted-foreground max-w-sm text-sm leading-relaxed">
				Pick the repositories Funnel should mirror. You can change this any time in
				Settings &rarr; Repositories.
			</p>
		</div>

		<OnboardingSteps active={3} />

		{#if !data.installed}
			<Card.Root class="mt-4">
				<Card.Header>
					<Card.Title>Installation not found</Card.Title>
					<Card.Description>
						Install <strong>{data.appName}</strong> on GitHub first, then return here.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Button href={data.installUrl} class="self-start">
						<ExternalLinkIcon />
						Install on GitHub
					</Button>
				</Card.Content>
			</Card.Root>
		{:else}
			<form method="POST" action="?/save">
				<Card.Root class="mt-4">
					<Card.Header class="flex-row items-center justify-between gap-2">
						<div class="flex flex-col gap-1">
							<Card.Title>{data.repos.length} repositories</Card.Title>
							<Card.Description>Owner: <code>{data.ownerLogin}</code></Card.Description>
						</div>
						<Button type="button" variant="outline" size="sm" onclick={toggleAll}>
							{allSelected ? 'Clear all' : 'Select all'}
						</Button>
					</Card.Header>
					<Card.Content class="p-0">
						{#if data.error}
							<p class="text-destructive px-6 pb-3 text-xs">{data.error}</p>
						{/if}
						<ul class="divide-border divide-y">
							{#each data.repos as repo (repo.fullName)}
								<li>
									<label
										class="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-6 py-2.5 text-sm"
									>
										<input
											type="checkbox"
											name="repos"
											value={repo.fullName}
											bind:group={selected}
											class="accent-primary size-4"
										/>
										<span class="truncate font-mono text-xs">{repo.fullName}</span>
										{#if repo.private}
											<Badge variant="secondary" class="ms-auto shrink-0">Private</Badge>
										{/if}
										{#if repo.archived}
											<Badge variant="outline" class="shrink-0">Archived</Badge>
										{/if}
									</label>
								</li>
							{/each}
						</ul>
						{#if data.repos.length === 0 && !data.error}
							<p class="text-muted-foreground px-6 py-4 text-xs">
								This installation has no repositories yet.
							</p>
						{/if}
					</Card.Content>
					<Card.Footer class="justify-end gap-2">
						<Button type="submit" disabled={selected.length === 0}>
							Save and continue
						</Button>
					</Card.Footer>
				</Card.Root>
			</form>
		{/if}
	</div>
</main>
