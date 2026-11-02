<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import DetailShell from '#lib/components/detail/DetailShell.svelte';
	import DuplicateDialog from '#lib/components/inbox/DuplicateDialog.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Field from '#lib/components/ui/field';
	import { SIZE_OPTIONS, labelTint } from '#lib/labels';
	import { removeSubmission, restoreSubmission } from '#lib/client/optimistic.svelte';
	import { clearSelection } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { RenderedSubmission } from '#lib/server/issues/types';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import RulerIcon from '@lucide/svelte/icons/ruler';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Document pane for a staged intake submission (SPEC §6.2). A compact
	 * status line (icon + word), the submission title, its source and received
	 * time, borderless prose, and the three triage decisions. The accept,
	 * duplicate and dismiss forms post to this route's actions; destructive
	 * dismiss is confirmed by name first.
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

	/** Hide the row the moment a decision is submitted (optimistic triage). */
	function begin(): void {
		removeSubmission(submission.id);
	}

	/**
	 * Settle a decision without re-running `load()`: a full refresh would race
	 * the SSE reconciliation and flicker the queue. The row was already removed
	 * optimistically, so success only needs to clear the selection; a failure
	 * restores the row (the pane stayed open throughout). The Inbox's inline
	 * `formError` status surfaces the reason, with or without JavaScript.
	 */
	async function settle(
		result: { type: string },
		update: (opts?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>
	) {
		await update({ reset: false, invalidateAll: false });
		pending = null;
		if (result.type === 'success') {
			clearSelection();
			return;
		}
		restoreSubmission(submission.id);
	}

	function confirmDismiss() {
		confirmingDismiss = false;
		dismissForm?.requestSubmit();
	}
</script>

<DetailShell
	ariaLabel="Intake submission"
	class="min-w-0 flex-1"
	contentKey={submission.bodyHtml}
>
	{#snippet header()}
		<div class="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
			<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
				<span class="status status-muted">
					<InboxIcon aria-hidden="true" />
					<span>Staged submission</span>
				</span>
				{#if submission.source}
					<span class="mono min-w-0 truncate text-caption text-fg-secondary" title={submission.source}>
						{submission.source}
					</span>
				{/if}
			</div>
			<h1
				class="min-w-0 truncate text-heading-sm font-semibold leading-heading-sm tracking-[-0.01em] text-fg"
				title={submission.title}
			>
				{submission.title.trim() || 'Untitled submission'}
			</h1>
			<div class="flex min-w-0 items-center gap-1.5 text-caption text-fg-secondary">
				<span class="shrink-0">Received</span>
				<time
					class="shrink-0 tabular-nums"
					datetime={new Date(submission.createdAt).toISOString()}
					title={absoluteTime(submission.createdAt)}
				>
					{timeAgo(submission.createdAt)}
				</time>
			</div>
		</div>
		<Button
			variant="ghost"
			size="icon-sm"
			title="Close"
			aria-label="Close detail"
			onclick={clearSelection}
		>
			<XIcon />
		</Button>
	{/snippet}

	<section class="flex flex-col" aria-label="Description">
		{#if submission.body.trim().length > 0}
			<div class="markdown">{@html submission.bodyHtml}</div>
		{:else}
			<p class="text-body text-fg-secondary">No description provided.</p>
		{/if}
	</section>

	<section class="flex flex-col gap-3 border-t border-border-subtle pt-4" aria-label="Triage">
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#if repoOptions.length > 0}
				<Field.Field>
					<Field.Label>Repository</Field.Label>
					<SingleSelect
						label="Repository"
						options={repoOptions}
						value={acceptRepo}
						onselect={(value) => (acceptRepo = value ?? '')}
						disabled={pending !== null}
					>
						{#snippet icon()}
							<GitBranchIcon class="size-4" />
						{/snippet}
					</SingleSelect>
				</Field.Field>
			{/if}

			<Field.Field>
				<Field.Label>Size</Field.Label>
				<SingleSelect
					label="No size"
					options={SIZE_OPTIONS}
					value={size || null}
					onselect={(value) => (size = value ?? '')}
					allowClear
					disabled={pending !== null}
				>
					{#snippet icon()}
						<RulerIcon class="size-4" style={labelTint(size)} />
					{/snippet}
				</SingleSelect>
			</Field.Field>
		</div>
	</section>

	{#snippet footer()}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex flex-wrap items-center gap-2">
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
						variant="destructive"
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
							<span data-icon="inline-start" class="inline-flex items-center">
								<Spinner size={12} />
							</span>
						{/if}
						Dismiss submission
					</Button>
				</form>

				<Button
					variant="outline"
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
				<Button type="submit" size="sm" disabled={pending !== null}>
					{#if pending === 'accept'}
						<span data-icon="inline-start" class="inline-flex items-center">
							<Spinner size={12} />
						</span>
					{/if}
					Triage as issue
				</Button>
			</form>
		</div>
	{/snippet}
</DetailShell>

<DuplicateDialog
	open={duplicating}
	{repos}
	{defaultRepo}
	id={submission.id}
	onopenchange={(open) => (duplicating = open)}
	onbegin={begin}
	onresult={(ok) => {
		if (ok) clearSelection();
		else restoreSubmission(submission.id);
	}}
/>

<Dialog.Root
	open={confirmingDismiss}
	onOpenChange={(open) => {
		if (pending === null) confirmingDismiss = open;
	}}
>
	<Dialog.Content aria-describedby={undefined} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Dismiss submission?</Dialog.Title>
			<Dialog.Description>
				This removes “{submission.title.trim() || 'Untitled submission'}” from the intake queue.
				The submission cannot be recovered.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Dialog.Close type="button">
				{#snippet child({ props })}
					<Button variant="outline" {...props} type="button" disabled={pending !== null}>
						Keep submission
					</Button>
				{/snippet}
			</Dialog.Close>
			<Button variant="destructive" onclick={confirmDismiss} disabled={pending !== null}>
				Dismiss submission
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
