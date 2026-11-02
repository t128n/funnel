<script lang="ts">
	import { page } from '$app/state';
	import { signInWithGitHub } from '#lib/client/auth';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '#lib/components/ui/button';
	import { Spinner } from '#lib/components/ui/spinner';
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
	<div class="flex flex-col gap-2">
		<h1 class="text-heading-md font-semibold leading-heading-md text-fg">Sign In</h1>
		<p class="max-w-[var(--layout-measure)] text-body leading-body text-fg-secondary">
			Access is limited to members of your GitHub organization.
		</p>
	</div>

	{#if error}
		<InlineStatus tone="error" message={error} />
	{/if}

	<form onsubmit={submit} class="flex flex-col gap-4">
		<Button type="submit" disabled={pending} class="w-fit min-w-48">
			{#if pending}
				<Spinner data-icon="inline-start" aria-label="Redirecting" />
				Redirecting…
			{:else}
				<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" class="size-4">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-2.91-.88-2.91-2.89 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 2.01-1.14 2.69-2.91 2.89.35.3.66.89.66 1.8 0 1.3-.01 2.35-.01 2.67 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
					/>
				</svg>
				Continue with GitHub
			{/if}
		</Button>
	</form>
</FocusedShell>
