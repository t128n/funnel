<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-5">
	<header class="flex flex-col gap-1">
		<h1 class="text-sm font-medium">GitHub App</h1>
		<p class="text-muted-foreground text-xs leading-relaxed">
			The App Funnel created and uses to mirror issues and post writes. Credentials are
			stored encrypted in the database.
		</p>
	</header>

	{#if !data.configured || !data.credentials}
		<Card.Root>
			<Card.Header>
				<Card.Title>No GitHub App</Card.Title>
				<Card.Description>
					Funnel has not been onboarded yet. Run the wizard to create and install an
					App.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button href="/onboarding">Start onboarding</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header class="flex-row items-center justify-between gap-3">
				<div class="flex flex-col gap-1">
					<Card.Title>{data.credentials.name}</Card.Title>
					<Card.Description>
						Owned by <code>{data.credentials.ownerLogin || '—'}</code>
					</Card.Description>
				</div>
				{#if data.credentials.installationId}
					<Badge class="bg-emerald-500/15 text-emerald-400">Installed</Badge>
				{:else}
					<Badge variant="destructive">Not installed</Badge>
				{/if}
			</Card.Header>
			<Card.Content class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-1">
					<span class="text-muted-foreground text-xs">App ID</span>
					<span class="font-mono text-sm">{data.credentials.appId}</span>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-muted-foreground text-xs">Slug</span>
					<span class="font-mono text-sm">{data.credentials.slug}</span>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-muted-foreground text-xs">Client ID</span>
					<span class="truncate font-mono text-sm">{data.credentials.clientId}</span>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-muted-foreground text-xs">Installation</span>
					<span class="font-mono text-sm">
						{data.credentials.installationId ?? '—'}
					</span>
				</div>
				{#if data.credentials.htmlUrl}
					<div class="flex flex-col gap-1">
						<span class="text-muted-foreground text-xs">On GitHub</span>
						<a
							href={data.credentials.htmlUrl}
							target="_blank"
							rel="noreferrer"
							class="text-foreground hover:text-muted-foreground inline-flex items-center gap-1 text-sm"
						>
							Open App
							<ExternalLinkIcon class="size-3" />
						</a>
					</div>
				{/if}
			</Card.Content>
			<Card.Footer class="justify-between gap-2">
				<span class="text-muted-foreground text-xs">
					{data.credentials.installationId
						? 'Repositories are managed in Settings → Repositories.'
						: 'Install the App to grant access to repositories.'}
				</span>
				{#if data.installUrl}
					<Button href={data.installUrl} variant="outline" size="sm">
						<ExternalLinkIcon />
						{data.credentials.installationId ? 'Manage installation' : 'Install'}
					</Button>
				{/if}
			</Card.Footer>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Reset</Card.Title>
				<Card.Description>
					Forget the App credentials and return to onboarding. This cannot be undone;
					you will need to create and install the App again.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<form
					method="POST"
					action="?/reset"
					onsubmit={(event) => {
						if (!confirm('Clear the GitHub App credentials and re-run onboarding?')) {
							event.preventDefault();
						}
					}}
				>
					<Button type="submit" variant="destructive">Reset GitHub App</Button>
				</form>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
