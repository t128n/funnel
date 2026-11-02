<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import LinkIcon from '@lucide/svelte/icons/link';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import { Textarea } from '#lib/components/ui/textarea';
	import { encodeSubmitDeeplinkQuery } from '#lib/client/intake-deeplink';
	import {
		hasSubmitPrefill,
		INTAKE_BODY_MAX,
		INTAKE_SOURCES,
		INTAKE_TITLE_MAX,
		normalizeIntakeSource
	} from '#lib/intake-prefill';
	import type { PageProps } from './$types';

	/**
	 * Public intake composer. The page stays a plain HTML form (SPEC §6.1):
	 * server-side prefill and the action's inline error work without JavaScript;
	 * the keyboard shortcut, focus management, and OS-aware hint are layered on
	 * as progressive enhancement.
	 */
	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	let isMac = $state(true);
	let copied = $state(false);
	let dirty = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;
	let syncSeq = 0;
	let formEl = $state<HTMLFormElement | null>(null);
	let titleEl = $state<HTMLElement | null>(null);
	let bodyEl = $state<HTMLElement | null>(null);
	let successEl = $state<HTMLHeadingElement | null>(null);
	let copyMessage = $state<string | null>(null);
	let copyFailed = $state(false);

	// Initial values only; the effect below keeps them in step with the action
	// result and same-route navigations.
	let title = $state(untrack(() => form?.title ?? data.prefill.title));
	let body = $state(untrack(() => form?.body ?? data.prefill.body));
	let source = $state(
		untrack(() => normalizeIntakeSource(form?.source ?? data.prefill.source))
	);

	const submitted = $derived(Boolean(form?.submitted));
	const submittedRef = $derived(
		(form as { submitted?: boolean; ref?: string } | null)?.ref ?? null
	);

	// The strip marks a shared prefilled link. It follows the loaded prefill
	// (so `Clear` and real navigations reset it) but is suppressed for URLs the
	// page wrote to itself, and disappears once the user starts editing.
	const hasPrefill = $derived(hasSubmitPrefill(data.prefill));
	const showPrefillStrip = $derived(hasPrefill && !data.selfSynced && !dirty);
	const titleLength = $derived(title.length);
	const showCounter = $derived(titleLength >= INTAKE_TITLE_MAX - 56);
	const hasContent = $derived(Boolean(title.trim() || body.trim() || source));

	const titleError = $derived(form?.error && !title.trim() ? form.error : null);
	const bodyError = $derived(
		form?.error && body.length > INTAKE_BODY_MAX ? form.error : null
	);
	const formError = $derived(
		form?.error && !titleError && !bodyError ? form.error : null
	);

	/** Keep unknown prefill sources selectable instead of silently dropping them. */
	const sourceOptions = $derived.by((): { value: string; label: string }[] => {
		const options: { value: string; label: string }[] = INTAKE_SOURCES.map((option) => ({
			...option
		}));

		if (source && !options.some((option) => option.value === source)) {
			options.push({ value: source, label: source });
		}

		return options;
	});

	/**
	 * Follow server-provided values on action failures and same-route
	 * navigations. Typing does not re-run this effect because it never reads
	 * `title`/`body`/`source`; it only writes them.
	 */
	$effect(() => {
		if (form?.submitted) return;

		title = form?.title ?? data.prefill.title;
		body = form?.body ?? data.prefill.body;
		source = normalizeIntakeSource(form?.source ?? data.prefill.source);
	});

	/**
	 * Mirror the draft into the address bar so it is itself a shareable link.
	 * Debounced (compression runs on each pass) and written as a shallow,
	 * replacing navigation so the back button is not polluted and no `load`
	 * re-runs (which would autofill the form from its own URL). A sequence guard
	 * drops stale writes.
	 */
	$effect(() => {
		if (!dirty || form?.submitted) return;

		const snapshot = { title, body, source };
		const timer = setTimeout(() => {
			void syncUrlToAddressBar(snapshot);
		}, 500);

		return () => clearTimeout(timer);
	});

	/**
	 * ⌘/Ctrl + Enter submits from anywhere in the composer. Attached
	 * imperatively so the `<form>` itself keeps its native semantics.
	 */
	$effect(() => {
		const el = formEl;
		if (!el) return;

		const onKeydown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing) return;
			if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
			if (submitting) return;

			event.preventDefault();
			el.requestSubmit();
		};

		el.addEventListener('keydown', onKeydown);
		return () => el.removeEventListener('keydown', onKeydown);
	});

	/**
	 * Warn before leaving a dirty draft. Same-path navigations are the page's
	 * own URL mirroring; they must never prompt.
	 */
	beforeNavigate(({ cancel, to }) => {
		if (!dirty || !hasContent || submitted || submitting) return;
		if (to?.url.pathname === page.url.pathname) return;
		if (!window.confirm('Discard this draft?')) cancel();
	});

	/** Move focus into the composer when the page is opened for writing. */
	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!dirty || !hasContent || submitted) return;
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', onBeforeUnload);

		if (form?.submitted || form?.error) {
			return () => window.removeEventListener('beforeunload', onBeforeUnload);
		}
		if (!window.matchMedia('(pointer: fine)').matches) {
			return () => window.removeEventListener('beforeunload', onBeforeUnload);
		}

		if (title.length > 0) {
			const el = bodyEl;
			if (el) {
				el.focus();
				if (el instanceof HTMLTextAreaElement) {
					el.setSelectionRange(el.value.length, el.value.length);
				}
			}
		} else {
			titleEl?.focus();
		}

		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	/** The form unmounts on success; keep keyboard focus and announcement intact. */
	$effect(() => {
		if (!form?.submitted) return;
		void tick().then(() => successEl?.focus({ preventScroll: true }));
	});

	/** A failed submission should leave the caret where it can be fixed. */
	$effect(() => {
		if (!form?.error) return;
		titleEl?.focus();
	});

	/** Enter in the title is a forward move, not a submit (⌘/Ctrl+Enter submits). */
	function onTitleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing) return;
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

		event.preventDefault();
		bodyEl?.focus();
	}

	/** Mark the draft as user-edited so the address bar starts tracking it. */
	function markDirty() {
		dirty = true;
	}

	/** Replace the address bar with the compact form of the current draft. */
	async function syncUrlToAddressBar(values: { title: string; body: string; source: string }) {
		if (form?.submitted || submitting) return;

		const seq = ++syncSeq;
		const query = await encodeSubmitDeeplinkQuery(values);
		if (seq !== syncSeq) return;

		const url = new URL(window.location.href);
		url.search = query ? `?${query}&s=1` : '';

		// Shallow + replace: updates `page.url` without re-running `load`, so the
		// form is never autofilled from the URL it just wrote.
		await goto(url, {
			state: untrack(() => page.state),
			shallow: true,
			replace: true
		});
	}

	function showCopyMessage(message: string, failed = false) {
		copyMessage = message;
		copyFailed = failed;
		clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copyMessage = null;
			copyFailed = false;
		}, 3000);
	}

	/** Copy a shareable link that reopens the composer with the current values. */
	async function copyDeeplink() {
		const query = await encodeSubmitDeeplinkQuery({ title, body, source });
		if (!query) {
			showCopyMessage(
				hasContent
					? 'This submission is too large to share as a link.'
					: 'Add a title, description, or source first.',
				true
			);
			return;
		}

		const url = new URL(window.location.href);
		url.search = `?${query}`;

		try {
			await navigator.clipboard.writeText(url.toString());
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => (copied = false), 3000);
			showCopyMessage('Draft link copied.');
		} catch {
			showCopyMessage("Couldn't copy the link.", true);
		}
	}

	/** Success action: copy the URL that holds the staged submission. */
	async function copyCurrentLink() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			showCopyMessage('Link copied.');
		} catch {
			showCopyMessage("Couldn't copy the link.", true);
		}
	}

	onDestroy(() => clearTimeout(copyTimeout));
</script>

<PageHead
	title={submitted ? 'Issue Submitted' : 'Submit an Issue'}
	description="Submit an issue for triage. Nothing is created on GitHub until it is accepted."
/>

<FocusedShell>
	{#if submitted}
		<section class="flex flex-col gap-4" role="status">
			<div class="flex items-start gap-3">
				<CircleCheckIcon class="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
				<div class="flex min-w-0 flex-col gap-2">
					<h1
						bind:this={successEl}
						tabindex="-1"
						class="text-heading-md font-semibold leading-heading-md text-fg outline-none"
					>
						Issue Submitted
					</h1>
					<p class="text-body leading-body text-fg-secondary">
						Your submission is staged for triage. Nothing is created on GitHub until a triager
						accepts it.
					</p>
				</div>
			</div>

			<dl class="label-value">
				{#if submittedRef}
					<dt>Reference</dt>
					<dd><span class="mono">{submittedRef}</span></dd>
				{/if}
				<dt>Status</dt>
				<dd>
					<span class="status status-success">
						<CircleCheckIcon aria-hidden="true" />
						Staged for triage
					</span>
				</dd>
				{#if source}
					<dt>Source</dt>
					<dd>{source}</dd>
				{/if}
			</dl>

			<div class="flex flex-wrap items-center gap-2">
				<Button onclick={() => void copyCurrentLink()}>
					<CopyIcon />
					Copy Link
				</Button>
				<Button variant="outline" href="/intake">Submit Another</Button>
			</div>
			<p class="min-h-4 text-caption" aria-live="polite">
				{#if copyMessage}
					<span class="status" class:status-error={copyFailed} class:status-success={!copyFailed}>
						{copyMessage}
					</span>
				{/if}
			</p>
		</section>
	{:else}
		<div class="flex flex-col gap-2">
			<h1 class="text-heading-md font-semibold leading-heading-md text-fg">Submit an Issue</h1>
			<p class="max-w-[var(--layout-measure)] text-body leading-body text-fg-secondary">
				Your submission goes to the intake queue for triage. Nothing is created on GitHub
				until it is accepted.
			</p>
		</div>

		{#if showPrefillStrip}
			<div
				class="flex flex-wrap items-center gap-2 border-y border-border-subtle py-2 text-caption text-fg-secondary"
			>
				<LinkIcon class="size-4 shrink-0" aria-hidden="true" />
				<span>Prefilled from a shared link</span>
				<a href="/intake" class="link ms-auto" onclick={() => (dirty = false)}>Clear</a>
			</div>
		{/if}

		<form
			bind:this={formEl}
			method="POST"
			autocomplete="off"
			class="flex flex-col gap-6"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					try {
						await update();
					} finally {
						submitting = false;
					}
				};
			}}
		>
			{#if formError}
				<InlineStatus tone="error" message={formError} />
			{/if}

			<Field.Field data-invalid={titleError ? true : undefined}>
				<div class="flex items-baseline justify-between gap-3">
					<Field.Label for="submission-title">Title</Field.Label>
					{#if showCounter}
						<span class="mono text-caption text-fg-muted" aria-hidden="true">
							{titleLength}/{INTAKE_TITLE_MAX}
						</span>
					{/if}
				</div>
				<Input
					bind:ref={titleEl}
					bind:value={title}
					id="submission-title"
					name="title"
					type="text"
					required
					maxlength={INTAKE_TITLE_MAX}
					placeholder="A short summary of the problem"
					aria-invalid={titleError ? true : undefined}
					aria-describedby={titleError ? 'submission-title-error' : undefined}
					onkeydown={onTitleKeydown}
					oninput={markDirty}
					class="h-9"
				/>
				{#if titleError}
					<p
						id="submission-title-error"
						class="flex items-center gap-1 text-caption text-error"
						role="alert"
					>
						<CircleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
						{titleError}
					</p>
				{/if}
			</Field.Field>

			<Field.Field data-invalid={bodyError ? true : undefined}>
				<Field.Label for="submission-body">Description</Field.Label>
				<Textarea
					bind:ref={bodyEl}
					bind:value={body}
					id="submission-body"
					name="body"
					maxlength={INTAKE_BODY_MAX}
					rows={6}
					placeholder="What happened, what you expected, and anything that would help a triager."
					aria-invalid={bodyError ? true : undefined}
					aria-describedby={bodyError ? 'submission-body-error' : undefined}
					oninput={markDirty}
				/>
				{#if bodyError}
					<p
						id="submission-body-error"
						class="flex items-center gap-1 text-caption text-error"
						role="alert"
					>
						<CircleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
						{bodyError}
					</p>
				{/if}
			</Field.Field>

			<Field.Field>
				<Field.Label for="submission-source">Source</Field.Label>
				<NativeSelect.Root
					id="submission-source"
					name="source"
					bind:value={source}
					onchange={markDirty}
				>
					<NativeSelect.Option value="">No source</NativeSelect.Option>
					{#each sourceOptions as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
				<Field.Description>
					Where this came from. Unknown sources from shared links are preserved.
				</Field.Description>
			</Field.Field>

			<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
				<Button type="button" variant="ghost" onclick={copyDeeplink} disabled={!hasContent}>
					<CopyIcon />
					{copied ? 'Copied' : 'Copy Draft Link'}
				</Button>
				<div class="flex items-center gap-3">
					<span class="text-caption text-fg-secondary" aria-hidden="true">
						{isMac ? '⌘' : 'Ctrl'} Enter
					</span>
					<Button
						type="submit"
						disabled={submitting}
						aria-busy={submitting}
						aria-keyshortcuts="Meta+Enter Control+Enter"
						class="min-w-28"
					>
						{submitting ? 'Submitting…' : 'Submit Issue'}
					</Button>
				</div>
			</footer>

			<p class="min-h-4 text-caption" aria-live="polite">
				{#if copyMessage}
					<span class="status" class:status-error={copyFailed} class:status-success={!copyFailed}>
						{copyMessage}
					</span>
				{/if}
			</p>
		</form>
	{/if}
</FocusedShell>
