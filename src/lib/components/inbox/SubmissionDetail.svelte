<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import IntakeTag from '#lib/components/common/IntakeTag.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import DetailShell from '#lib/components/detail/DetailShell.svelte';
	import DuplicateDialog from '#lib/components/inbox/DuplicateDialog.svelte';
	import { Button } from '#lib/components/ui/button';
	import { SIZE_OPTIONS, labelTint } from '#lib/labels';
	import { removeSubmission, restoreSubmission } from '#lib/client/optimistic.svelte';
	import { clearSelection } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { RenderedSubmission } from '#lib/server/issues/types';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import RulerIcon from '@lucide/svelte/icons/ruler';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Document-style detail pane for a staged intake submission (SPEC §6.2).
	 * Mirrors the Inspector Pane: a two-line header (identity + source, title,
	 * meta), a borderless description, a pill property strip, and triage actions
	 * pinned at the base. The accept / dismiss / duplicate forms post to the
	 * Inbox page actions.
	 */
	interface Props {
		submission: RenderedSubmission;
		repos: string[];
		defaultRepo: string;
	}

	let { submission, repos, defaultRepo }: Props = $props();

	type Pending = 'accept' | 'dismiss' | null;
	let pending = $state<Pending>(null);

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
	 * `formError` alert surfaces the reason, with or without JavaScript.
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
</script>

<DetailShell
	ariaLabel="Intake submission"
	class="min-w-0 flex-1"
	contentKey={submission.bodyHtml}
>
	{#snippet header()}
		<div class="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
			<div class="flex min-w-0 items-center gap-2">
				<IntakeTag />
				{#if submission.source}
					<span
						class="mono text-muted-foreground min-w-0 truncate text-sm font-medium"
						title={submission.source}
					>
						{submission.source}
					</span>
				{/if}
				<h1
					class="min-w-0 flex-1 truncate text-xl leading-tight font-semibold tracking-tight"
					title={submission.title}
				>
					{submission.title}
				</h1>
			</div>
			<div class="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
				<span class="shrink-0">Staged</span>
				<span aria-hidden="true">·</span>
				<span class="shrink-0" title={absoluteTime(submission.createdAt)}>
					{timeAgo(submission.createdAt)}
				</span>
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
			<div class="markdown text-foreground text-sm leading-relaxed">{@html submission.bodyHtml}</div>
		{:else}
			<div class="text-muted-foreground text-sm">No description provided.</div>
		{/if}
	</section>

	<section class="flex flex-wrap items-center gap-1.5" aria-label="Triage">
		{#if repoOptions.length > 0}
			<SingleSelect
				variant="pill"
				label="Repository"
				options={repoOptions}
				value={acceptRepo}
				onselect={(value) => (acceptRepo = value ?? '')}
				disabled={pending !== null}
			>
				{#snippet icon()}
					<GitBranchIcon class="size-3.5" />
				{/snippet}
			</SingleSelect>
		{/if}

		<SingleSelect
			variant="pill"
			label="No size"
			options={SIZE_OPTIONS}
			value={size || null}
			onselect={(value) => (size = value ?? '')}
			allowClear
			disabled={pending !== null}
		>
			{#snippet icon()}
				<RulerIcon class="size-3.5" style={labelTint(size)} />
			{/snippet}
		</SingleSelect>
	</section>

	{#snippet footer()}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex items-center gap-1">
				<form
					method="POST"
					action="?/dismiss"
					use:enhance={() => {
						pending = 'dismiss';
						begin();
						return async ({ result, update }) => {
							await settle(result, update);
						};
					}}
				>
					<input type="hidden" name="id" value={submission.id} />
					<Button variant="outline" size="sm" type="submit" disabled={pending !== null}>
						{#if pending === 'dismiss'}
							<span data-icon="inline-start" class="inline-flex items-center">
								<Spinner size={12} />
							</span>
						{/if}
						Dismiss
					</Button>
				</form>

				<Button
					variant="outline"
					size="sm"
					onclick={() => (duplicating = true)}
					disabled={pending !== null}
				>
					Duplicate
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
					Accept
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
