<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '@sveltestrap/sveltestrap';
	import {
		describeStatus,
		errorSection,
		isNotFound,
		isRetryable,
		recoveryFor,
		safeErrorMessage,
		type ErrorSection
	} from '#lib/errors';
	import { pageTitle } from '#lib/seo';

	/**
	 * The shared error surface, rendered inside the app shell by the route
	 * error boundaries (or by the root error page's lightweight shell).
	 *
	 * A 404 is a dead end by definition: the primary action returns to the
	 * matching list and `Try Again` is omitted unless the caller supplies a
	 * retryable transient failure. Server messages are never shown for a 404,
	 * which keeps internal sync vocabulary and duplicate status text out of the
	 * page.
	 */
	interface Props {
		status: number;
		message?: string | null;
		requestId?: string | null;
		/** Override the area inferred from the current pathname. */
		section?: ErrorSection;
		/** Override the heading or explanation from the shared status copy. */
		title?: string;
		description?: string;
		/** Retry handler; shown only for a retryable status unless overridden. */
		onretry?: (() => void) | null;
		retryable?: boolean;
		backHref?: string;
		backLabel?: string;
		class?: string;
	}

	let {
		status,
		message = null,
		requestId = null,
		section,
		title,
		description,
		onretry = null,
		retryable,
		backHref,
		backLabel,
		class: className = ''
	}: Props = $props();

	const area = $derived(section ?? errorSection(page.url.pathname));
	const copy = $derived(describeStatus(status, area));
	const heading = $derived(title ?? copy.title);
	const detail = $derived(
		description ??
			(isNotFound(status) ? copy.description : safeErrorMessage(status, message))
	);
	const canRetry = $derived(
		onretry !== null && (retryable ?? isRetryable(status))
	);
	const signIn = $derived(status === 401 || status === 403);
	const recovery = $derived(
		signIn ? { href: '/login', label: 'Sign In' } : recoveryFor(area)
	);
	const target = $derived(backHref ?? recovery.href);
	const targetLabel = $derived(backLabel ?? recovery.label);
</script>

<svelte:head>
	<title>{pageTitle(heading)}</title>
</svelte:head>

<section class="py-4 {className}" aria-labelledby="error-heading">
	<div class="border rounded p-3 p-md-4 d-flex flex-column gap-3">
		<div>
			<h1 id="error-heading" class="h4 mb-1 text-break">{heading}</h1>
			<p class="measure text-body-secondary mb-0">{detail}</p>
		</div>

		<div class="d-flex flex-wrap align-items-center gap-2">
			<Button color="primary" href={target}>{targetLabel}</Button>
			{#if canRetry}
				<Button color="outline-secondary" onclick={() => onretry?.()}>
					<i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>
					Try Again
				</Button>
			{/if}
		</div>

		{#if requestId}
			<p class="font-monospace small text-body-secondary mb-0">Reference: {requestId}</p>
		{/if}
	</div>
</section>
