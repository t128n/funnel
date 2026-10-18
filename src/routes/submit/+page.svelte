<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, tick, untrack } from 'svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import IntakeTag from '#lib/components/common/IntakeTag.svelte';
	import * as Alert from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import * as Kbd from '#lib/components/ui/kbd';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import { Textarea } from '#lib/components/ui/textarea';
	import {
		hasSubmitPrefill,
		INTAKE_BODY_MAX,
		INTAKE_SOURCES,
		INTAKE_TITLE_MAX,
		normalizeIntakeSource
	} from '#lib/intake-prefill';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import LinkIcon from '@lucide/svelte/icons/link';
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
	let formEl = $state<HTMLFormElement | null>(null);
	let titleEl = $state<HTMLElement | null>(null);
	let bodyEl = $state<HTMLElement | null>(null);
	let successEl = $state<HTMLHeadingElement | null>(null);

	// Initial values only; the effect below keeps them in step with the action
	// result and same-route navigations.
	let title = $state(untrack(() => form?.title ?? data.prefill.title));
	let body = $state(untrack(() => form?.body ?? data.prefill.body));
	let source = $state(
		untrack(() => normalizeIntakeSource(form?.source ?? data.prefill.source))
	);

	const hasPrefill = $derived(hasSubmitPrefill(data.prefill));
	const titleLength = $derived(title.length);
	const showCounter = $derived(titleLength >= INTAKE_TITLE_MAX - 56);

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

	/** Move focus into the composer when the page is opened for writing. */
	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

		if (form?.submitted || form?.error) return;
		if (!window.matchMedia('(pointer: fine)').matches) return;

		if (title.length > 0) {
			const el = bodyEl;
			if (!el) return;
			el.focus();
			if (el instanceof HTMLTextAreaElement) {
				el.setSelectionRange(el.value.length, el.value.length);
			}
		} else {
			titleEl?.focus();
		}
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
</script>

<svelte:head>
	<title>{form?.submitted ? 'Submission received' : 'Submit an issue'} · Funnel</title>
	<meta
		name="description"
		content="Submit an issue for triage. Nothing is created on GitHub until it is accepted."
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	class="surface-shell bg-[color:var(--surface-canvas)] flex min-h-svh items-center justify-center p-4 sm:p-6"
	aria-labelledby="submit-heading"
>
	<div class="w-full max-w-2xl">
		<div
			class="bg-[color:var(--surface-card)] border-[color:var(--surface-border)] overflow-hidden rounded-lg border shadow-sm dark:shadow-none"
		>
			<header
				class="border-[color:var(--surface-divider)] flex h-11 items-center gap-2 border-b px-4"
			>
				<span
					class="bg-primary text-primary-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-md"
				>
					<FunnelIcon class="size-3" />
				</span>
				<span
					class="text-muted-foreground text-[11px] font-medium tracking-tight dark:text-[#9ca3af]"
				>
					Funnel
				</span>
				<span class="text-muted-foreground/50 dark:text-[#6b6e76]" aria-hidden="true">/</span>
				<h1
					id="submit-heading"
					class="text-foreground truncate text-[13px] font-medium tracking-tight dark:text-[#f3f4f6]"
				>
					{form?.submitted ? 'Submission received' : 'New submission'}
				</h1>
				<span class="ml-auto shrink-0">
					<IntakeTag />
				</span>
			</header>

			{#if form?.submitted}
				<div class="flex flex-col gap-4 px-4 py-5 sm:px-5" role="status">
					<div class="flex items-start gap-3">
						<span
							class="bg-success/10 text-success mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md"
						>
							<CircleCheckIcon class="size-4" />
						</span>
						<div class="flex min-w-0 flex-col gap-1">
							<h2
								bind:this={successEl}
								tabindex="-1"
								class="text-foreground text-sm font-medium tracking-tight outline-none dark:text-[#f3f4f6]"
							>
								Thanks — your submission is in.
							</h2>
							<p
								class="text-muted-foreground text-[13px] leading-relaxed dark:text-[#9ca3af]"
							>
								A triager will review it shortly. Nothing is created on GitHub until it's accepted,
								so there's nothing else you need to do.
							</p>
						</div>
					</div>
				</div>
				<footer
					class="border-[color:var(--surface-divider)] flex items-center justify-end border-t px-4 py-3"
				>
					<Button
						href="/submit"
						class="focus-visible:outline-[color:var(--surface-accent)] focus-visible:ring-0 focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-offset-2"
					>
						Submit another
					</Button>
				</footer>
			{:else}
				<form
					bind:this={formEl}
					method="POST"
					autocomplete="off"
					aria-labelledby="submit-heading"
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
					{#if hasPrefill}
						<div
							class="border-[color:var(--surface-divider)] text-muted-foreground flex h-8 items-center gap-1.5 border-b px-4 text-xs dark:text-[#9ca3af]"
						>
							<LinkIcon class="size-3 shrink-0" aria-hidden="true" />
							<span>Prefilled from link</span>
							<a
								href="/submit"
								class="hover:text-foreground focus-visible:outline-[color:var(--surface-accent)] ml-auto rounded px-1.5 py-1 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-offset-2 dark:hover:text-[#f3f4f6]"
							>
								Clear
							</a>
						</div>
					{/if}

					<!-- Seamless writing canvas: no interior borders, one shared left edge. -->
					<div class="flex flex-col gap-0.5 px-3 pt-2.5 pb-2 sm:px-4">
						{#if form?.error}
							<Alert.Root
								id="submit-error"
								variant="destructive"
								class="border-destructive/25 bg-destructive/5 mb-2"
							>
								<CircleAlertIcon />
								<Alert.Title>Couldn't submit</Alert.Title>
								<Alert.Description>{form.error}</Alert.Description>
							</Alert.Root>
						{/if}

						<div class="relative">
							<label class="sr-only" for="submission-title">Issue title</label>
							<Input
								bind:ref={titleEl}
								bind:value={title}
								id="submission-title"
								name="title"
								type="text"
								required
								maxlength={INTAKE_TITLE_MAX}
								placeholder="Issue title"
								aria-invalid={form?.error ? true : undefined}
								aria-errormessage={form?.error ? 'submit-error' : undefined}
								onkeydown={onTitleKeydown}
								class="[@media(hover:hover)]:hover:bg-[color:var(--surface-card-hover)] focus-visible:outline-[color:var(--surface-accent)] h-auto rounded-md border-transparent bg-transparent px-2 py-1.5 text-lg font-medium tracking-tight shadow-none transition-colors duration-150 ease-out placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-offset-2 md:text-lg dark:bg-transparent dark:text-[#f3f4f6] dark:placeholder:text-[#6b6e76] {showCounter
									? 'pr-16'
									: ''}"
							/>
							{#if showCounter}
								<span
									class="mono text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] tabular-nums dark:text-[#9ca3af]"
									aria-hidden="true"
								>
									{titleLength}/{INTAKE_TITLE_MAX}
								</span>
							{/if}
						</div>

						<div class="relative">
							<label class="sr-only" for="submission-body">Description</label>
							<Textarea
								bind:ref={bodyEl}
								bind:value={body}
								id="submission-body"
								name="body"
								maxlength={INTAKE_BODY_MAX}
								placeholder="Add a description…"
								class="focus-visible:outline-[color:var(--surface-accent)] min-h-44 resize-none rounded-md border-transparent bg-transparent px-2 py-2 text-base leading-relaxed shadow-none transition-colors duration-150 ease-out placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-offset-2 md:text-sm dark:bg-transparent dark:text-[#d4d6db] dark:placeholder:text-[#6b6e76]"
							></Textarea>
						</div>
					</div>

					<footer
						class="border-[color:var(--surface-divider)] flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 sm:px-4"
					>
						<div class="flex min-w-0 items-center gap-1.5">
							<LinkIcon
								class="text-muted-foreground size-3.5 shrink-0 dark:text-[#9ca3af]"
								aria-hidden="true"
							/>
							<NativeSelect.Root
								name="source"
								bind:value={source}
								size="sm"
								class="focus-visible:outline-[color:var(--surface-accent)] w-32 [&>select]:text-base [&>select]:focus-visible:ring-0 [&>select]:focus-visible:outline [&>select]:focus-visible:outline-[1.5px] [&>select]:focus-visible:outline-offset-2 sm:[&>select]:text-xs dark:[&>select]:text-[#9ca3af]"
								aria-label="Source"
								title="Where this submission came from"
							>
								<option value="">Add source…</option>
								{#each sourceOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</NativeSelect.Root>
						</div>

						<div class="ml-auto flex items-center gap-3">
							<span class="text-muted-foreground hidden text-[11px] dark:text-[#9ca3af] sm:inline">
								Markdown supported
							</span>
							<Button
								type="submit"
								disabled={submitting}
								aria-busy={submitting}
								aria-keyshortcuts="Meta+Enter Control+Enter"
								class="focus-visible:outline-[color:var(--surface-accent)] active:scale-[0.98] focus-visible:ring-0 focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-offset-2"
							>
								Submit
								<span class="inline-flex h-4 w-7 items-center justify-center">
									{#if submitting}
										<Spinner size={11} label="Submitting" />
									{:else}
										<Kbd.Root
											class="border-primary-foreground/30 text-primary-foreground/80 h-4 min-w-4 border bg-transparent px-1 text-[0.625rem] leading-none font-normal"
											aria-hidden="true"
										>
											{isMac ? '⌘' : 'Ctrl'}↵
										</Kbd.Root>
									{/if}
								</span>
							</Button>
						</div>
					</footer>
				</form>
			{/if}
		</div>
	</div>
</main>
