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
		Input,
		Label,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import DuplicateDialog from '#lib/components/inbox/DuplicateDialog.svelte';
	import { SIZE_OPTIONS, STATUS_OPTIONS, labelTint } from '#lib/labels';
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
		/** Non-reserved labels in use, offered as extra accept labels. */
		labelOptions: string[];
		/** Assignable logins across the mirror, offered by the assignee picker. */
		assigneeOptions: string[];
		/** Latest dismissal event, so an archived row still offers Undo. */
		undoEventId?: string | null;
	}

	let {
		submission,
		repos,
		defaultRepo,
		labelOptions,
		assigneeOptions,
		undoEventId = null
	}: Props = $props();

	type Pending = 'accept' | 'dismiss' | null;
	let pending = $state<Pending>(null);
	let confirmingDismiss = $state(false);
	let dismissForm: HTMLFormElement | undefined = $state();

	let acceptRepo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let status = $state('backlog');
	let size = $state('');
	let labels = $state<string[]>([]);
	let assignees = $state<string[]>([]);
	let dismissReason = $state('');
	let dismissedEventId = $state<string | null>(untrack(() => undoEventId));
	let duplicating = $state(false);

	const labelSelectOptions = $derived(
		labelOptions.map((label) => ({ value: label, label }))
	);
	const assigneeSelectOptions = $derived(
		assigneeOptions.map((login) => ({ value: login, label: login }))
	);

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

{#if submission.archivedAt !== null && !dismissedEventId}
	<Alert color="secondary" class="border d-flex flex-wrap align-items-center gap-2">
		<i class="bi bi-archive" aria-hidden="true"></i>
		<span>This submission is archived.</span>
		{#if submission.dismissReason}
			<span>Reason: {submission.dismissReason}</span>
		{:else if submission.duplicateRepo && submission.duplicateNumber}
			<span>
				Duplicated to {submission.duplicateRepo}#{submission.duplicateNumber}.
			</span>
		{/if}
	</Alert>
{/if}

{#if formError}
	<Alert color="danger" class="border d-flex align-items-center gap-2">
		<i class="bi bi-exclamation-circle" aria-hidden="true"></i>
		<span>{formError}</span>
	</Alert>
{/if}

{#if dismissedEventId}
	<Alert color="warning" class="border d-flex flex-wrap align-items-center justify-content-between gap-2">
		<span class="d-inline-flex align-items-center gap-2">
			<i class="bi bi-archive" aria-hidden="true"></i>
			<span>Submission dismissed and archived.</span>
		</span>
		<form
			method="POST"
			action="?/undo"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update({ reset: false, refreshAll: false });
					if (result.type === 'success') {
						dismissedEventId = null;
						clearSelection({ invalidateAll: true });
					}
				};
			}}
		>
			<input type="hidden" name="eventId" value={dismissedEventId} />
			<Button type="submit" color="outline-secondary" size="sm">Undo dismiss</Button>
		</form>
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
					<div class="col-12 col-md-4">
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

				<div class="col-12 col-md-4">
					<FormGroup class="mb-0">
						<Label>Status</Label>
						<SingleSelect
							label="Backlog"
							options={STATUS_OPTIONS}
							value={status}
							onselect={(value) => (status = value ?? 'backlog')}
							disabled={pending !== null}
						>
							{#snippet icon()}
								<i class="bi bi-circle-half fs-6" aria-hidden="true"></i>
							{/snippet}
						</SingleSelect>
					</FormGroup>
				</div>

				<div class="col-6 col-md-4">
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

				<div class="col-12 col-md-6">
					<FormGroup class="mb-0">
						<Label>Labels</Label>
						<MultiSelect
							label="Labels"
							options={labelSelectOptions}
							selected={labels}
							onselect={(values) => (labels = values)}
							display="selection"
							placeholder="No extra labels"
							size="md"
							fullWidth
							disabled={pending !== null}
						/>
					</FormGroup>
				</div>

				<div class="col-12 col-md-6">
					<FormGroup class="mb-0">
						<Label>Assignees</Label>
						<MultiSelect
							label="Assignees"
							options={assigneeSelectOptions}
							selected={assignees}
							onselect={(values) => (assignees = values)}
							display="selection"
							placeholder="Unassigned"
							size="md"
							fullWidth
							disabled={pending !== null}
						/>
					</FormGroup>
				</div>
			</div>
		</CardBody>
	</Card>
</section>

<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 border-top mt-4 pt-4">
	<div class="d-flex flex-wrap align-items-center gap-2">
		<Button
			color="danger"
			size="sm"
			type="button"
			disabled={pending !== null}
			onclick={() => (confirmingDismiss = true)}
		>
			Dismiss submission
		</Button>

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
		<input type="hidden" name="status" value={status} />
		<input type="hidden" name="size" value={size} />
		<input type="hidden" name="labels" value={labels.join(',')} />
		<input type="hidden" name="assignees" value={assignees.join(',')} />
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
		<p>
			This archives “{title}” with your reason. You can undo it from this page or
			from the Inbox right after dismissing.
		</p>
		<form
			id="dismiss-submission-form"
			method="POST"
			action="?/dismiss"
			bind:this={dismissForm}
			use:enhance={() => {
				pending = 'dismiss';
				begin();
				return async ({ result, update }) => {
					await update({ reset: false, refreshAll: false });
					pending = null;
					if (result.type === 'success') {
						dismissedEventId =
							typeof result.data?.eventId === 'string' ? result.data.eventId : null;
						confirmingDismiss = false;
						return;
					}
					restoreSubmission(submission.id);
				};
			}}
		>
			<input type="hidden" name="id" value={submission.id} />
			<FormGroup class="mb-0">
				<Label for="dismiss-reason">Reason</Label>
				<Input
					id="dismiss-reason"
					name="reason"
					type="textarea"
					rows={3}
					maxlength={500}
					required
					bind:value={dismissReason}
					placeholder="Why is this submission being dismissed?"
				/>
				<div class="form-text">Required, up to 500 characters.</div>
			</FormGroup>
		</form>
	</ModalBody>
	<ModalFooter>
		<Button color="outline-secondary" onclick={closeDismiss} disabled={pending !== null}>
			Keep submission
		</Button>
		<Button
			type="submit"
			form="dismiss-submission-form"
			color="danger"
			disabled={pending !== null || dismissReason.trim().length === 0}
		>
			{#if pending === 'dismiss'}
				<span class="d-inline-flex align-items-center me-1">
					<Spinner size={12} />
				</span>
			{/if}
			Dismiss submission
		</Button>
	</ModalFooter>
</Modal>

<style>
	.tabular {
		font-variant-numeric: tabular-nums;
	}
</style>
