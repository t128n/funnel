<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import {
		Alert,
		Button,
		Card,
		CardBody,
		FormGroup,
		Label,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import DuplicateDialog from '#lib/components/inbox/DuplicateDialog.svelte';
	import { SIZE_OPTIONS, labelTint } from '#lib/labels';
	import { removeSubmission, restoreSubmission } from '#lib/client/optimistic.svelte';
	import { clearSelection } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { RenderedSubmission } from '#lib/server/issues/types';

	/**
	 * Standalone review page for a staged intake submission (Composition A §9).
	 *
	 * Rendered by `/inbox/submission/<id>` inside the page container: a header
	 * (staged source, title, received time), the submission body as document
	 * prose, a Triage section for repository and size, and the existing Accept /
	 * Mark duplicate / Dismiss actions. The accept, duplicate and dismiss forms
	 * post to the route's actions; destructive dismiss is confirmed by name
	 * first. Removing the split pane removed the close-X header — success now
	 * returns to the Inbox queue through `clearSelection()`.
	 */
	interface Props {
		submission: RenderedSubmission;
		repos: string[];
		defaultRepo: string;
	}

	let { submission, repos, defaultRepo }: Props = $props();

	type Pending = 'accept' | 'dismiss' | null;
	let pending = $state<Pending>(null);
	let confirmingDismiss = $state(false);
	let dismissForm: HTMLFormElement | undefined = $state();

	let acceptRepo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let size = $state('');
	let duplicating = $state(false);

	const repoOptions = $derived(repos.map((slug) => ({ value: slug, label: slug })));
	const title = $derived(submission.title.trim() || 'Untitled submission');
	const source = $derived(submission.source?.trim() || '');

	// A failed action leaves the page open and restores the row; its reason is
	// the only affordance the reader gets, so keep it in the content region.
	const formError = $derived(
		page.form && 'message' in (page.form.data ?? {})
			? ((page.form.data as { message?: string }).message ?? null)
			: null
	);

	/** Hide the row the moment a decision is submitted (optimistic triage). */
	function begin(): void {
		removeSubmission(submission.id);
	}

	/**
	 * Settle a decision without re-running `load()`: a full refresh would race
	 * the SSE reconciliation, flicker the queue, and 404 the detail route once
	 * the submission is gone. The row was already removed optimistically, so
	 * success only needs to leave the page; a failure restores the row (the page
	 * stayed open throughout). The Inbox's inline `formError` status surfaces
	 * the reason, with or without JavaScript.
	 */
	async function settle(
		result: { type: string },
		update: (opts?: { reset?: boolean; refreshAll?: boolean }) => Promise<void>
	) {
		await update({ reset: false, refreshAll: false });
		pending = null;
		if (result.type === 'success') {
			// Re-run the destination's load so the queue cannot come back with the
			// consumed row still interactive.
			clearSelection({ invalidateAll: true });
			return;
		}
		restoreSubmission(submission.id);
	}

	function confirmDismiss() {
		confirmingDismiss = false;
		dismissForm?.requestSubmit();
	}

	function closeDismiss() {
		if (pending === null) confirmingDismiss = false;
	}

	function toggleDismiss() {
		if (pending === null) confirmingDismiss = !confirmingDismiss;
	}
</script>

<header class="mb-4">
	<div class="d-flex min-w-0 flex-wrap align-items-center gap-2 small text-body-secondary mb-1">
		<span class="d-inline-flex align-items-center gap-1">
			<i class="bi bi-inbox" aria-hidden="true"></i>
			<span>Staged submission</span>
		</span>
		{#if source}
			<span class="font-monospace min-w-0 text-truncate" title={source}>{source}</span>
		{/if}
	</div>
	<h1 class="h3 mb-2 text-break">{title}</h1>
	<div class="d-flex align-items-center gap-2 small text-body-secondary">
		<span class="flex-shrink-0">Received</span>
		<time
			class="flex-shrink-0 tabular"
			datetime={new Date(submission.createdAt).toISOString()}
			title={absoluteTime(submission.createdAt)}
		>
			{timeAgo(submission.createdAt)}
		</time>
	</div>
</header>

{#if formError}
	<Alert color="danger" class="border d-flex align-items-center gap-2">
		<i class="bi bi-exclamation-circle" aria-hidden="true"></i>
		<span>{formError}</span>
	</Alert>
{/if}

<section class="issue-document" aria-label="Description">
	{#if submission.body.trim().length > 0}
		<div class="markdown">{@html submission.bodyHtml}</div>
	{:else}
		<p class="text-body-secondary mb-0">No description provided.</p>
	{/if}
</section>

<section class="border-top mt-4 pt-4" aria-label="Triage">
	<h2 class="h5 mb-3">Triage</h2>
	<Card>
		<CardBody>
			<div class="row g-3">
				{#if repoOptions.length > 0}
					<div class="col-12 col-sm-6">
						<FormGroup class="mb-0">
							<Label>Repository</Label>
							<SingleSelect
								label="Repository"
								options={repoOptions}
								value={acceptRepo}
								onselect={(value) => (acceptRepo = value ?? '')}
								disabled={pending !== null}
							>
								{#snippet icon()}
									<i class="bi bi-git fs-6" aria-hidden="true"></i>
								{/snippet}
							</SingleSelect>
						</FormGroup>
					</div>
				{/if}

				<div class="col-12 col-sm-6">
					<FormGroup class="mb-0">
						<Label>Size</Label>
						<SingleSelect
							label="No size"
							options={SIZE_OPTIONS}
							value={size || null}
							onselect={(value) => (size = value ?? '')}
							allowClear
							disabled={pending !== null}
						>
							{#snippet icon()}
								<i class="bi bi-rulers fs-6" style={labelTint(size)} aria-hidden="true"></i>
							{/snippet}
						</SingleSelect>
					</FormGroup>
				</div>
			</div>
		</CardBody>
	</Card>
</section>

<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 border-top mt-4 pt-4">
	<div class="d-flex flex-wrap align-items-center gap-2">
		<form
			method="POST"
			action="?/dismiss"
			bind:this={dismissForm}
			use:enhance={() => {
				pending = 'dismiss';
				begin();
				return async ({ result, update }) => {
					await settle(result, update);
				};
			}}
		>
			<input type="hidden" name="id" value={submission.id} />
			<Button
				color="danger"
				size="sm"
				type="submit"
				disabled={pending !== null}
				onclick={(event) => {
					if (confirmingDismiss) return;
					event.preventDefault();
					confirmingDismiss = true;
				}}
			>
				{#if pending === 'dismiss'}
					<span class="d-inline-flex align-items-center me-1">
						<Spinner size={12} />
					</span>
				{/if}
				Dismiss submission
			</Button>
		</form>

		<Button
			color="outline-secondary"
			size="sm"
			onclick={() => (duplicating = true)}
			disabled={pending !== null}
		>
			Mark duplicate
		</Button>
	</div>

	<form
		method="POST"
		action="?/accept"
		use:enhance={() => {
			pending = 'accept';
			begin();
			return async ({ result, update }) => {
				await settle(result, update);
			};
		}}
	>
		<input type="hidden" name="id" value={submission.id} />
		<input type="hidden" name="repo" value={acceptRepo} />
		<input type="hidden" name="size" value={size} />
		<Button type="submit" color="primary" size="sm" disabled={pending !== null}>
			{#if pending === 'accept'}
				<span class="d-inline-flex align-items-center me-1">
					<Spinner size={12} />
				</span>
			{/if}
			Triage as issue
		</Button>
	</form>
</div>

<DuplicateDialog
	open={duplicating}
	{repos}
	{defaultRepo}
	id={submission.id}
	onopenchange={(open) => (duplicating = open)}
	onbegin={begin}
	onresult={(ok) => {
		if (ok) clearSelection({ invalidateAll: true });
		else restoreSubmission(submission.id);
	}}
/>

<Modal isOpen={confirmingDismiss} toggle={toggleDismiss}>
	<ModalHeader toggle={closeDismiss}>Dismiss submission?</ModalHeader>
	<ModalBody>
		<p class="mb-0">
			This removes “{title}” from the intake queue. The submission cannot be recovered.
		</p>
	</ModalBody>
	<ModalFooter>
		<Button color="outline-secondary" onclick={closeDismiss} disabled={pending !== null}>
			Keep submission
		</Button>
		<Button color="danger" onclick={confirmDismiss} disabled={pending !== null}>
			Dismiss submission
		</Button>
	</ModalFooter>
</Modal>

<style>
	.tabular {
		font-variant-numeric: tabular-nums;
	}
</style>
