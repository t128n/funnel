<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import { describeError, safeErrorMessage } from '#lib/errors';
	import { pageTitle } from '#lib/seo';

	/**
	 * Full-page error surface, shared by the root `+error.svelte`. Full-page is
	 * deliberate: nested `+error.svelte` files can't preserve the cockpit shell
	 * (the shell's `data` is unavailable when its subtree fails), so one
	 * consistent focused surface is used for every 4xx/5xx.
	 */
	interface Props {
		status: number;
		message?: string | null;
		requestId?: string | null;
	}

	let { status, message = null, requestId = null }: Props = $props();

	const copy = $derived(describeError(status));
	const detail = $derived(safeErrorMessage(status, message));
	const signIn = $derived(status === 401 || status === 403);

	function reload(): void {
		location.reload();
	}
</script>

<svelte:head>
	<title>{pageTitle(copy.title)}</title>
</svelte:head>

<main
	class="d-flex min-vh-100 flex-column align-items-center justify-content-center px-3 py-5"
	aria-labelledby="error-heading"
>
	<div class="form-measure d-flex flex-column gap-4">
		<a href="/" class="fw-semibold text-body text-decoration-none" translate="no">funnel</a>

		<div class="d-flex flex-column gap-2">
			<span class="font-monospace small text-body-secondary">{status}</span>
			<h1 id="error-heading" class="h4 mb-0">{copy.title}</h1>
			<p class="measure text-body-secondary mb-0">{detail}</p>
		</div>

		<div class="d-flex flex-wrap align-items-center gap-2">
			<Button color="primary" onclick={reload}>
				<i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>
				Try Again
			</Button>
			<Button color="outline-secondary" href={signIn ? '/login' : '/issues'}>
				{signIn ? 'Sign In' : 'Back to Issues'}
			</Button>
		</div>

		{#if requestId}
			<p class="font-monospace small text-body-secondary mb-0">Reference: {requestId}</p>
		{/if}
	</div>
</main>
