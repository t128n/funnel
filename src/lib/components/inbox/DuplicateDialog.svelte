<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import * as Alert from '#lib/components/primitives/alert';
	import { Button } from '#lib/components/primitives/button';
	import * as Dialog from '#lib/components/primitives/dialog';
	import * as Field from '#lib/components/primitives/field';
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
			color: issue.state === 'closed' ? 'var(--muted-foreground)' : 'var(--primary)'
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
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!pending) onopenchange(next);
	}}
>
	<Dialog.Content aria-describedby={undefined} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="text-base font-semibold">Duplicate submission</Dialog.Title>
			<Dialog.Description class="text-muted-foreground text-xs">
				The submission text is posted as a comment on an existing issue, then cleared from the
				queue.
			</Dialog.Description>
		</Dialog.Header>

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
			<div class="flex flex-col gap-4">
				<input type="hidden" name="id" value={id} />
				<input type="hidden" name="repo" value={repo} />
				<input type="hidden" name="number" value={number} />

				<Field.Field>
					<Field.Label>Repository</Field.Label>
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
				</Field.Field>

				<Field.Field>
					<Field.Label>Existing issue</Field.Label>
					<SingleSelect
						label={issueLabel}
						options={issueOptions}
						value={number || null}
						onselect={(value) => (number = value ?? '')}
						disabled={pending || loading || issueOptions.length === 0}
					/>
					{#if loading}
						<Field.Description class="flex items-center gap-1.5">
							<Spinner size={12} />
							Loading issues…
						</Field.Description>
					{:else if issuesError}
						<Field.Description class="text-destructive">{issuesError}</Field.Description>
					{:else if issueOptions.length === 0}
						<Field.Description>No mirrored issues in this repository.</Field.Description>
					{/if}
				</Field.Field>
			</div>

			{#if error}
				<Alert.Root variant="destructive" class="mt-4">
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}

			<Dialog.Footer class="mt-4">
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button variant="outline" {...props} type="button" disabled={pending}>Cancel</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={pending || loading || number.trim().length === 0}>
					{#if pending}
						<span data-icon="inline-start" class="inline-flex items-center">
							<Spinner size={13} />
						</span>
					{/if}
					Duplicate
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
