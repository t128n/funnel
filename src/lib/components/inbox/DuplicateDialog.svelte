<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		Button,
		FormGroup,
		Label,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import { fetchRepoIssues } from '#lib/client/mutations';
	import type { IssueOption } from '#lib/server/issues/types';

	/**
	 * Structured "duplicate" flow for a staged submission: post the submission
	 * text as a comment on an existing mirrored issue, then clear the queue
	 * (SPEC §6.2). Mirrors {@link IssueActionDialog} — the caller owns the
	 * staging-row bookkeeping through {@link onbegin}/{@link onresult}, while the
	 * dialog owns the form so the action still posts through SvelteKit. The
	 * target issue is chosen from the mirror, not typed by hand.
	 */
	interface Props {
		open: boolean;
		id: string;
		repos: string[];
		defaultRepo: string;
		onopenchange: (open: boolean) => void;
		/** Hide the row optimistically once a decision is submitted. */
		onbegin: () => void;
		/** Settle the decision: `true` clears the selection, `false` restores the row. */
		onresult: (ok: boolean) => void;
	}

	let { open, id, repos, defaultRepo, onopenchange, onbegin, onresult }: Props = $props();

	let repo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let number = $state('');
	let pending = $state(false);
	let error = $state<string | null>(null);

	let issues = $state<IssueOption[]>([]);
	let loading = $state(false);
	let issuesError = $state<string | null>(null);
	/** Guards against an out-of-order fetch clobbering a newer repo's list. */
	let loadSeq = 0;

	const repoOptions = $derived(repos.map((slug) => ({ value: slug, label: slug })));

	/**
	 * Mirrored issues for the selected repo. Duplicates resolve against the
	 * mirror (SPEC §6.2), so this is the only list that can be picked from.
	 */
	const issueOptions = $derived(
		issues.map((issue) => ({
			value: String(issue.number),
			label: `#${issue.number} ${issue.title}`,
			color: issue.state === 'closed' ? 'var(--bs-secondary-color)' : 'var(--bs-primary)'
		}))
	);

	const issueLabel = $derived(
		loading
			? 'Loading issues…'
			: issueOptions.length === 0
				? 'No issues in this repository'
				: 'Select an issue'
	);

	async function loadIssues() {
		const seq = ++loadSeq;
		loading = true;
		issuesError = null;
		const result = await fetchRepoIssues(repo);
		if (seq !== loadSeq) return;
		loading = false;
		if (result.ok) {
			issues = result.value;
		} else {
			issues = [];
			issuesError = result.error;
		}
		// Drop a stale selection that is not in the new list.
		if (!issues.some((issue) => String(issue.number) === number)) number = '';
	}

	// Reset the fields each time the dialog (re)opens so a cancelled action
	// never leaks a stale target into the next one.
	$effect(() => {
		if (open) {
			repo = defaultRepo || repos[0] || '';
			number = '';
			error = null;
		}
	});

	// (Re)load the issue list when the dialog opens or the repo changes.
	$effect(() => {
		if (!open || !repo) return;
		void repo;
		void loadIssues();
	});

	function close() {
		if (!pending) onopenchange(false);
	}

	function toggle() {
		if (!pending) onopenchange(!open);
	}
</script>

<Modal isOpen={open} toggle={toggle}>
	<ModalHeader toggle={close}>Mark as duplicate</ModalHeader>

	<form
		method="POST"
		action="?/duplicate"
		use:enhance={() => {
			pending = true;
			error = null;
			onbegin();
			return async ({ result, update }) => {
				await update({ reset: false, invalidateAll: false });
				pending = false;
				if (result.type === 'success') {
					onopenchange(false);
					onresult(true);
					return;
				}
				error =
					(result.type === 'failure' && typeof result.data?.message === 'string'
						? result.data.message
						: null) ?? 'Could not duplicate the submission.';
				onresult(false);
			};
		}}
	>
		<ModalBody>
			<p class="text-body-secondary">
				The submission text is posted as a comment on an existing issue, then cleared from the
				queue.
			</p>

			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="repo" value={repo} />
			<input type="hidden" name="number" value={number} />

			<FormGroup>
				<Label>Repository</Label>
				<SingleSelect
					label="Repository"
					options={repoOptions}
					value={repo}
					onselect={(value) => {
						repo = value ?? '';
						number = '';
					}}
					disabled={pending}
				/>
			</FormGroup>

			<FormGroup class="mb-0">
				<Label>Existing issue</Label>
				<SingleSelect
					label={issueLabel}
					options={issueOptions}
					value={number || null}
					onselect={(value) => (number = value ?? '')}
					disabled={pending || loading || issueOptions.length === 0}
				/>
				{#if loading}
					<div class="form-text d-flex align-items-center gap-2">
						<Spinner size={12} />
						Loading issues…
					</div>
				{:else if issuesError}
					<div class="form-text text-danger">{issuesError}</div>
				{:else if issueOptions.length === 0}
					<div class="form-text">No mirrored issues in this repository.</div>
				{/if}
			</FormGroup>

			{#if error}
				<InlineStatus tone="error" message={error} class="mt-4" />
			{/if}
		</ModalBody>

		<ModalFooter>
			<Button color="outline-secondary" type="button" onclick={close} disabled={pending}>
				Cancel
			</Button>
			<Button type="submit" color="primary" disabled={pending || loading || number.trim().length === 0}>
				{#if pending}
					<span class="d-inline-flex align-items-center me-1">
						<Spinner size={13} />
					</span>
				{/if}
				Mark duplicate
			</Button>
		</ModalFooter>
	</form>
</Modal>
