<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import { Button } from '#lib/components/ui/button';
	import ConfirmDialog from '#lib/components/settings/confirm-dialog.svelte';
	import Section from '#lib/components/settings/section.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let resetForm = $state<HTMLFormElement | null>(null);
	let confirmOpen = $state(false);
	let confirmed = $state(false);

	function onResetSubmit(event: SubmitEvent): void {
		if (confirmed) return;
		event.preventDefault();
		confirmOpen = true;
	}

	function confirmReset(): void {
		confirmed = true;
		resetForm?.requestSubmit();
	}
</script>

<div class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6">
	{#if !data.configured || !data.credentials}
		<Section
			title="GitHub App"
			description="Funnel has not been onboarded yet. Run the wizard to create and install an App."
		>
			<div>
				<Button href="/onboarding">Start Onboarding</Button>
			</div>
		</Section>
	{:else}
		<Section
			title="Application"
			description="Credentials are stored encrypted in the database."
		>
			<dl class="label-value">
				<dt>Status</dt>
				<dd>
					{#if data.credentials.installationId}
						<span class="status status-success">
							<CircleCheckIcon aria-hidden="true" />
							Installed
						</span>
					{:else}
						<span class="status status-error">
							<CircleAlertIcon aria-hidden="true" />
							Not Installed
						</span>
					{/if}
				</dd>
				<dt>App name</dt>
				<dd class="truncate">{data.credentials.name}</dd>
				<dt>Owner</dt>
				<dd class="truncate">{data.credentials.ownerLogin || '—'}</dd>
				<dt>App ID</dt>
				<dd><span class="mono">{data.credentials.appId}</span></dd>
				<dt>Slug</dt>
				<dd><span class="mono break-all">{data.credentials.slug}</span></dd>
				<dt>Client ID</dt>
				<dd><span class="mono break-all">{data.credentials.clientId}</span></dd>
				<dt>Installation</dt>
				<dd><span class="mono">{data.credentials.installationId ?? '—'}</span></dd>
				{#if data.credentials.htmlUrl}
					<dt>On GitHub</dt>
					<dd>
						<a
							href={data.credentials.htmlUrl}
							target="_blank"
							rel="noreferrer"
							class="link inline-flex items-center gap-1.5"
						>
							Open App
							<ExternalLinkIcon class="size-3.5" aria-hidden="true" />
						</a>
					</dd>
				{/if}
			</dl>

			<p class="text-body text-fg-secondary">
				{data.credentials.installationId
					? 'Repositories are managed in Settings → Repositories.'
					: 'Install the App to grant access to repositories.'}
			</p>

			{#if data.installUrl}
				<div>
					<Button href={data.installUrl} variant="outline">
						<ExternalLinkIcon />
						{data.credentials.installationId ? 'Manage Installation' : 'Install on GitHub'}
					</Button>
				</div>
			{/if}
		</Section>

		<Section
			title="Danger zone"
			description="Forget the App credentials and return to onboarding. This cannot be undone; you will need to create and install the App again."
			danger
		>
			<form
				method="POST"
				action="?/reset"
				bind:this={resetForm}
				onsubmit={onResetSubmit}
			>
				<Button type="submit" variant="destructive">Reset GitHub App</Button>
			</form>
		</Section>
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Reset GitHub App"
	description="This clears the App credentials and returns Funnel to onboarding. Issues already mirrored stay in place, but GitHub writes stop until you install an App again."
	confirmLabel="Reset GitHub App"
	onconfirm={confirmReset}
/>
