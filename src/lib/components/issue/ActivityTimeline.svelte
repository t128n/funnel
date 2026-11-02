<script module lang="ts">
	/**
	 * Anchor for a zero-based timeline index: `#c1` first.
	 */
	export function commentNumber(index: number): string {
		return `#c${index + 1}`;
	}
</script>

<script lang="ts">
	import { Button } from '#lib/components/ui/button';
	import { Textarea } from '#lib/components/ui/textarea';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { RenderedComment, RenderedWorkNote } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import LockIcon from '@lucide/svelte/icons/lock';

	/**
	 * The issue activity timeline: GitHub comments and internal work notes,
	 * merged in chronological order and rendered as ruled document entries —
	 * author and time in the caption line, prose at 1rem/1.6. Internal notes
	 * carry an `Internal` lock badge on `surface`, never a yellow reporter card.
	 */
	interface Props {
		comments: RenderedComment[];
		workNotes: RenderedWorkNote[];
		/** Legacy chat presentation flag; ruled entries are always used. */
		bubbles?: boolean;
		/** Restrict the timeline to one channel; defaults to both merged. */
		filter?: 'all' | 'comments' | 'notes';
		/** GitHub login of the signed-in viewer; enables note authoring actions. */
		viewerLogin?: string | null;
		/** Login of the issue reporter; kept for API compatibility. */
		reporterLogin?: string | null;
		/** Hide edit/publish/delete affordances (RBAC `read`). */
		readonly?: boolean;
		/** `note:<id>` while a note mutation is in flight. */
		busyId?: string | null;
		/** Focus the composer for this entry (reply link). */
		onreply?: (id: string) => void;
		onedit: (id: string, body: string) => void;
		ondelete: (id: string) => void;
		onpublish: (id: string) => void;
	}

	let {
		comments,
		workNotes,
		bubbles: _bubbles = false,
		filter = 'all',
		viewerLogin = null,
		reporterLogin: _reporterLogin = null,
		readonly = false,
		busyId = null,
		onreply,
		onedit,
		ondelete,
		onpublish
	}: Props = $props();

	type Entry =
		| { kind: 'comment'; at: number; comment: RenderedComment }
		| { kind: 'note'; at: number; note: RenderedWorkNote };

	const entries = $derived(
		[
			...(filter === 'notes'
				? []
				: comments.map((comment): Entry => ({ kind: 'comment', at: comment.createdAt, comment }))),
			...(filter === 'comments'
				? []
				: workNotes.map((note): Entry => ({ kind: 'note', at: note.createdAt, note })))
		].sort((a, b) => a.at - b.at)
	);

	let editingId = $state<string | null>(null);
	let draft = $state('');

	function startEdit(note: RenderedWorkNote) {
		editingId = note.id;
		draft = note.body;
	}

	function cancelEdit() {
		editingId = null;
		draft = '';
	}

	function saveEdit(id: string) {
		const body = draft.trim();
		if (body.length === 0) return;
		onedit(id, body);
		editingId = null;
		draft = '';
	}

	function entryId(entry: Entry): string {
		return entry.kind === 'comment' ? entry.comment.externalId : entry.note.id;
	}
</script>

<div class="flex flex-col">
	{#each entries as entry, index (entry.kind === 'comment' ? `c${entry.comment.externalId}` : entry.note.id)}
		{@const author = entry.kind === 'comment' ? entry.comment.author : entry.note.author}
		{@const at = entry.kind === 'comment' ? entry.comment.createdAt : entry.note.createdAt}
		{@const tone =
			entry.kind === 'note' ? 'note' : undefined}
		<article
			class="activity-entry flex max-w-[var(--layout-measure)] flex-col gap-1.5 border-t border-border-subtle py-3 first:border-t-0"
			data-index={index}
			data-tone={tone}
		>
			<header class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-secondary">
				{#if entry.kind === 'comment'}
					<a
						id={`c${index + 1}`}
						href={`#c${index + 1}`}
						class="mono link font-semibold"
						aria-label={`Comment ${commentNumber(index)}`}>{commentNumber(index)}</a
					>
				{/if}
				<strong class="font-semibold text-fg">{author?.login ?? 'ghost'}</strong>
				{#if entry.kind === 'note'}
					<span
						class="inline-flex items-center gap-1 rounded-sm bg-surface px-1.5 py-0.5 font-semibold text-fg-secondary"
					>
						<LockIcon class="size-3 shrink-0" aria-hidden="true" />
						Internal
					</span>
				{/if}
				<span title={absoluteTime(at)}>{timeAgo(at)}</span>
				{#if onreply}
					<button
						type="button"
						class="link inline-flex h-(--size-control-sm) items-center"
						onclick={() => onreply(entryId(entry))}
					>
						Reply
					</button>
				{/if}
				{#if entry.kind === 'note' && !readonly && viewerLogin && entry.note.author?.login === viewerLogin}
					<span class="ml-auto flex items-center gap-2">
						<button
							type="button"
							class="link inline-flex h-(--size-control-sm) items-center disabled:pointer-events-none disabled:opacity-50"
							disabled={busyId === `note:${entry.note.id}`}
							title="Edit note"
							onclick={() => startEdit(entry.note)}
						>
							Edit
						</button>
						<button
							type="button"
							class="link inline-flex h-(--size-control-sm) items-center disabled:pointer-events-none disabled:opacity-50"
							title="Publish to GitHub as a comment (removes the note)"
							disabled={busyId === `note:${entry.note.id}`}
							onclick={() => onpublish(entry.note.id)}
						>
							Publish
						</button>
						<button
							type="button"
							class="link inline-flex h-(--size-control-sm) items-center disabled:pointer-events-none disabled:opacity-50"
							title="Delete note"
							disabled={busyId === `note:${entry.note.id}`}
							onclick={() => ondelete(entry.note.id)}
						>
							Delete
						</button>
					</span>
				{/if}
			</header>
			{#if entry.kind === 'comment'}
				<div class="markdown">{@html entry.comment.bodyHtml}</div>
			{:else}
				{@render noteBody(entry.note)}
			{/if}
		</article>
	{/each}
</div>

{#snippet noteBody(note: RenderedWorkNote)}
	{#if editingId === note.id}
		<div class="flex flex-col gap-2">
			<Textarea
				rows={3}
				value={draft}
				oninput={(e) => (draft = e.currentTarget.value)}
				placeholder="Update the work note…"
				aria-label="Edit work note"
			></Textarea>
			<div class="flex justify-end gap-1">
				<Button variant="ghost" size="xs" onclick={cancelEdit}>Cancel</Button>
				<Button
					variant="secondary"
					size="xs"
					onclick={() => saveEdit(note.id)}
					disabled={draft.trim().length === 0}
				>
					Save
				</Button>
			</div>
		</div>
	{:else}
		<div class={cn('markdown', 'text-body-content leading-body-content')}>
			{@html note.bodyHtml}
		</div>
	{/if}
{/snippet}
