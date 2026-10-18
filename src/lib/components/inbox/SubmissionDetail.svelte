<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import DetailShell from '#lib/components/detail/DetailShell.svelte';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import { PRIORITY_OPTIONS, SIZE_OPTIONS } from '#lib/labels';
	import { clearSelection } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { RenderedSubmission } from '#lib/server/issues/types';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Document-style detail pane for a staged intake submission (SPEC §6.2).
	 * Mirrors the Inspector Pane: full body on top, triage actions pinned at the
	 * base. The accept / dismiss / duplicate forms post to the Inbox page actions.
	 */
	interface Props {
		submission: RenderedSubmission;
		repos: string[];
		defaultRepo: string;
	}

	let { submission, repos, defaultRepo }: Props = $props();

	type Pending = 'accept' | 'dismiss' | 'duplicate' | null;
	let pending = $state<Pending>(null);

	let acceptRepo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let priority = $state('');
	let size = $state('');
	let duplicating = $state(false);
	let duplicateRepo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let duplicateNumber = $state('');

	/** Apply a decision's result: refresh, clear the busy flag, and — since a
	 *  staged row is hard-deleted on every decision — drop the selection so the
	 *  canvas returns to its empty state instead of a stale id. */
	async function settle(
		result: { type: string },
		update: (opts?: { reset: boolean }) => Promise<void>
	) {
		await update({ reset: false });
		pending = null;
		if (result.type === 'success') clearSelection();
	}
</script>

<DetailShell
	ariaLabel="Intake submission"
	class="min-w-0 flex-1"
	contentKey={submission.bodyHtml}
>
	{#snippet header()}
		<div class="flex min-w-0 items-center gap-2 overflow-hidden">
			<Badge
				variant="secondary"
				class="px-1 text-[0.625rem] font-semibold tracking-wider uppercase"
			>
				intake
			</Badge>
			{#if submission.source}
				<Badge variant="outline" class="mono truncate">{submission.source}</Badge>
			{/if}
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

	<h1 class="text-xl font-semibold tracking-tight">{submission.title}</h1>
	<div class="text-muted-foreground text-xs">
		Staged
		<span title={absoluteTime(submission.createdAt)}>
			· {timeAgo(submission.createdAt)}
		</span>
	</div>

	{#if submission.body.trim().length > 0}
		<div class="markdown text-foreground text-sm">{@html submission.bodyHtml}</div>
	{:else}
		<div class="text-muted-foreground text-sm">No description provided.</div>
	{/if}

	{#snippet footer()}
		<div class="flex flex-col gap-2">
			<form
				class="flex flex-wrap items-center gap-1"
				method="POST"
				action="?/accept"
				use:enhance={() => {
					pending = 'accept';
					return async ({ result, update }) => {
						await settle(result, update);
					};
				}}
			>
				<input type="hidden" name="id" value={submission.id} />

				<NativeSelect.Root
					name="repo"
					bind:value={acceptRepo}
					size="sm"
					aria-label="Target repository"
				>
					{#each repos as repo (repo)}
						<option value={repo}>{repo}</option>
					{/each}
				</NativeSelect.Root>

				<NativeSelect.Root
					name="priority"
					bind:value={priority}
					size="sm"
					aria-label="Priority"
				>
					<option value="">No priority</option>
					{#each PRIORITY_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</NativeSelect.Root>

				<NativeSelect.Root name="size" bind:value={size} size="sm" aria-label="Size">
					<option value="">No size</option>
					{#each SIZE_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</NativeSelect.Root>

				<Button type="submit" size="sm" disabled={pending !== null}>
					{#if pending === 'accept'}
						<span data-icon="inline-start" class="inline-flex items-center">
							<Spinner size={12} />
						</span>
					{/if}
					Accept
				</Button>
			</form>

			<div class="flex flex-wrap items-center gap-2">
				<form
					method="POST"
					action="?/dismiss"
					use:enhance={() => {
						pending = 'dismiss';
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
					onclick={() => (duplicating = !duplicating)}
					aria-expanded={duplicating}
				>
					Duplicate
				</Button>
			</div>

			{#if duplicating}
				<form
					class="flex flex-wrap items-center gap-1 border-t border-dashed pt-2"
					method="POST"
					action="?/duplicate"
					use:enhance={() => {
						pending = 'duplicate';
						return async ({ result, update }) => {
							await settle(result, update);
						};
					}}
				>
					<input type="hidden" name="id" value={submission.id} />
					<NativeSelect.Root
						name="repo"
						bind:value={duplicateRepo}
						size="sm"
						aria-label="Existing issue repository"
					>
						{#each repos as repo (repo)}
							<option value={repo}>{repo}</option>
						{/each}
					</NativeSelect.Root>
					<Input
						class="w-24"
						name="number"
						type="number"
						min="1"
						placeholder="#issue"
						bind:value={duplicateNumber}
						aria-label="Existing issue number"
					/>
					<Button type="submit" size="sm" disabled={pending !== null}>
						{#if pending === 'duplicate'}
							<span data-icon="inline-start" class="inline-flex items-center">
								<Spinner size={12} />
							</span>
						{/if}
						Duplicate
					</Button>
				</form>
			{/if}
		</div>
	{/snippet}
</DetailShell>
