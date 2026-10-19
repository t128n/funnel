<script lang="ts">
	import { Button } from '#lib/components/ui/button';
	import { describeError, safeErrorMessage } from '#lib/errors';
	import { pageTitle } from '#lib/seo';
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';

	/**
	 * Full-page error surface, shared by the root `+error.svelte`. Full-page is
	 * deliberate: nested `+error.svelte` files can't preserve the cockpit shell
	 * (the shell's `data` is unavailable when its subtree fails), so one
	 * consistent, branded page is used for every 4xx/5xx.
	 *
	 * The raw message is only shown for client errors; 5xx is replaced with
	 * generic copy by {@link safeErrorMessage}. Unexpected errors carry a
	 * correlation id the user can quote.
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
	class="bg-background flex min-h-svh flex-col items-center justify-center p-6"
	aria-labelledby="error-heading"
>
	<div class="flex w-full max-w-md flex-col items-center gap-7 text-center">
		<a
			href="/"
			class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2"
		>
			<FunnelIcon class="size-4" />
			Funnel
		</a>

		<div class="flex flex-col items-center gap-3">
			<span class="mono text-muted-foreground/40 text-6xl leading-none font-extralight tracking-tight">
				{status}
			</span>
			<h1 id="error-heading" class="text-lg font-medium">{copy.title}</h1>
			<p class="text-muted-foreground max-w-sm text-sm leading-relaxed">{detail}</p>
		</div>

		<div class="flex flex-wrap items-center justify-center gap-2">
			<Button onclick={reload}>
				<RotateCwIcon />
				Try again
			</Button>
			<Button variant="outline" href={signIn ? '/login' : '/inbox'}>
				{signIn ? 'Sign in' : 'Back to cockpit'}
			</Button>
		</div>

		{#if requestId}
			<p class="mono text-muted-foreground/60 text-[11px]">
				Reference: {requestId}
			</p>
		{/if}
	</div>
</main>
