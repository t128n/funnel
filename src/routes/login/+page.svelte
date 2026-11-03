<script lang="ts">
	import { page } from '$app/state';
	import { signInWithGitHub } from '#lib/client/auth';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button, Spinner } from '@sveltestrap/sveltestrap';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let pending = $state(false);
	let clientError = $state<string | null>(null);

	const authError = $derived(page.url.searchParams.get('error'));
	const error = $derived(
		clientError ??
			(authError
				? authError === 'access_denied'
					? 'GitHub access was denied. Try again to sign in.'
					: 'Sign-in could not be completed. Try again.'
				: null)
	);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		clientError = null;
		pending = true;
		signInWithGitHub(data.redirectTo).catch(() => {
			pending = false;
			clientError = 'GitHub sign-in could not start. Try again.';
		});
	}
</script>

<PageHead
	title="Sign In"
	description="Sign in to Funnel with your GitHub organization account."
/>

<FocusedShell>
	<header>
		<h1 class="h4 mb-1">Sign In</h1>
		<p class="measure text-body-secondary mb-0">
			Access is limited to members of your GitHub organization.
		</p>
	</header>

	{#if error}
		<InlineStatus tone="error" message={error} />
	{/if}

	<form onsubmit={submit}>
		<Button type="submit" color="primary" disabled={pending}>
			{#if pending}
				<Spinner size="sm" class="me-2" aria-label="Redirecting" />
				Redirecting…
			{:else}
				<i class="bi bi-github me-2" aria-hidden="true"></i>
				Continue with GitHub
			{/if}
		</Button>
	</form>
</FocusedShell>
