<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
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

<div class="d-flex w-100 flex-column gap-4">
	{#if !data.configured || !data.credentials}
		<Section
			title="GitHub App"
			description="Funnel has not been onboarded yet. Run the wizard to create and install an App."
		>
			<div>
				<Button color="primary" href="/onboarding">Start Onboarding</Button>
			</div>
		</Section>
	{:else}
		<Section title="Application" description="Credentials are stored encrypted in the database.">
			<dl class="property-list">
				<dt>Status</dt>
				<dd>
					{#if data.credentials.installationId}
						<span class="text-success">Installed</span>
					{:else}
						<span class="text-danger">Not installed</span>
					{/if}
				</dd>
				<dt>App name</dt>
				<dd class="text-truncate">{data.credentials.name}</dd>
				<dt>Owner</dt>
				<dd class="text-truncate">{data.credentials.ownerLogin || '—'}</dd>
				<dt>App ID</dt>
				<dd><span class="font-monospace">{data.credentials.appId}</span></dd>
				<dt>Slug</dt>
				<dd><span class="font-monospace text-break">{data.credentials.slug}</span></dd>
				<dt>Client ID</dt>
				<dd><span class="font-monospace text-break">{data.credentials.clientId}</span></dd>
				<dt>Installation</dt>
				<dd><span class="font-monospace">{data.credentials.installationId ?? '—'}</span></dd>
				<dt>Webhook secret</dt>
				<dd>
					{#if data.webhookConfigured}
						<span class="text-success">Configured</span>
					{:else}
						<span class="text-warning">Not configured</span>
					{/if}
				</dd>
				<dt>Webhook URL</dt>
				<dd><span class="font-monospace text-break">{data.webhookUrl}</span></dd>
				{#if data.credentials.htmlUrl}
					<dt>On GitHub</dt>
					<dd>
						<a href={data.credentials.htmlUrl} target="_blank" rel="noreferrer">Open App</a>
					</dd>
				{/if}
			</dl>

			<p class="mb-0 text-body-secondary">
				{data.credentials.installationId
					? 'Repositories are managed in Settings → Repositories.'
					: 'Install the App to grant access to repositories.'}
			</p>

			{#if !data.webhookConfigured}
				<p class="mb-0 text-body-secondary">
					Apps created before webhook support have no secret. Recreate the App, or add
					the webhook and secret on GitHub and re-onboard, to receive events. Polling
					keeps issues up to date either way.
				</p>
			{/if}

			{#if data.installUrl}
				<div>
					<Button href={data.installUrl} color="outline-secondary">
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
			<form method="POST" action="?/reset" bind:this={resetForm} onsubmit={onResetSubmit}>
				<Button type="submit" color="danger">Reset GitHub App</Button>
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
