<script lang="ts">
	import { Button } from '#lib/components/ui/button';
	import { describeError, safeErrorMessage } from '#lib/errors';
	import { pageTitle } from '#lib/seo';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';

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
	class="flex min-h-svh flex-col items-center justify-center bg-canvas px-[var(--layout-page-padding)] py-12"
	aria-labelledby="error-heading"
>
	<div class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6">
		<a href="/" class="text-body font-semibold text-fg" translate="no">funnel</a>

		<div class="flex flex-col gap-2">
			<span class="mono text-caption text-fg-muted">{status}</span>
			<h1 id="error-heading" class="text-heading-md font-semibold leading-heading-md text-fg">
				{copy.title}
			</h1>
			<p class="max-w-[var(--layout-measure)] text-body leading-body text-fg-secondary">
				{detail}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Button onclick={reload}>
				<RotateCwIcon />
				Try Again
			</Button>
			<Button variant="outline" href={signIn ? '/login' : '/issues'}>
				{signIn ? 'Sign In' : 'Back to Issues'}
			</Button>
		</div>

		{#if requestId}
			<p class="mono text-caption text-fg-muted">Reference: {requestId}</p>
		{/if}
	</div>
</main>
