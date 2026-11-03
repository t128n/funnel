<script module lang="ts">
	/**
	 * Anchor for a zero-based timeline index: `#c1` first.
	 */
	export function commentNumber(index: number): string {
		return `#c${index + 1}`;
	}
</script>

<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { RenderedComment, RenderedWorkNote } from '#lib/server/issues/types';

	/**
	 * The issue activity timeline: GitHub comments and internal work notes,
	 * merged in chronological order and rendered as ruled document entries —
	 * author and time in a compact caption line, prose at 1rem/1.6. Internal
	 * notes carry a small lock label in the caption, never a filled panel.
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

{#snippet entryMeta(entry: Entry, index: number)}
	{@const author = entry.kind === 'comment' ? entry.comment.author : entry.note.author}
	{@const at = entry.kind === 'comment' ? entry.comment.createdAt : entry.note.createdAt}
	<header class="d-flex min-w-0 flex-wrap align-items-center gap-2 activity-meta text-body-secondary">
		{#if entry.kind === 'comment'}
			<a
				id={`c${index + 1}`}
				href={`#c${index + 1}`}
				class="font-monospace link-primary text-decoration-none"
				aria-label={`Comment ${commentNumber(index)}`}>{commentNumber(index)}</a
			>
			<span class="text-body fw-semibold">{author?.login ?? 'ghost'}</span>
			<span>
				commented
				<time datetime={new Date(at).toISOString()} title={absoluteTime(at)}>{timeAgo(at)}</time>
			</span>
		{:else}
			<span class="text-body fw-semibold">{author?.login ?? 'ghost'}</span>
			<span class="d-inline-flex align-items-center gap-1">
				<i class="bi bi-lock flex-shrink-0" aria-hidden="true"></i>
				Internal
			</span>
			<span title={absoluteTime(at)}>{timeAgo(at)}</span>
		{/if}
		{#if onreply}
			<Button
				color="link"
				size="sm"
				class="d-inline-flex align-items-center text-decoration-none px-1 py-0"
				onclick={() => onreply(entryId(entry))}
			>
				Reply
			</Button>
		{/if}
		{#if entry.kind === 'note' && !readonly && viewerLogin && entry.note.author?.login === viewerLogin}
			<span class="ms-auto d-flex align-items-center gap-2">
				<Button
					color="link"
					size="sm"
					class="d-inline-flex align-items-center text-decoration-none px-1 py-0"
					disabled={busyId === `note:${entry.note.id}`}
					title="Edit note"
					onclick={() => startEdit(entry.note)}
				>
					Edit
				</Button>
				<Button
					color="link"
					size="sm"
					class="d-inline-flex align-items-center text-decoration-none px-1 py-0"
					title="Publish to GitHub as a comment (removes the note)"
					disabled={busyId === `note:${entry.note.id}`}
					onclick={() => onpublish(entry.note.id)}
				>
					Publish
				</Button>
				<Button
					color="link"
					size="sm"
					class="d-inline-flex align-items-center text-decoration-none px-1 py-0 text-body-secondary"
					title="Delete note"
					disabled={busyId === `note:${entry.note.id}`}
					onclick={() => ondelete(entry.note.id)}
				>
					Delete
				</Button>
			</span>
		{/if}
	</header>
{/snippet}

<div class="d-flex flex-column">
	{#each entries as entry, index (entry.kind === 'comment' ? `c${entry.comment.externalId}` : entry.note.id)}
		<article
			class="activity-entry {entry.kind === 'comment'
				? 'd-flex gap-3 py-3'
				: 'd-flex flex-column gap-1 py-2'} {index > 0 ? 'border-top' : ''}"
			data-index={index}
			data-tone={entry.kind === 'note' ? 'note' : undefined}
		>
			{#if entry.kind === 'comment'}
				<i class="bi bi-person-circle fs-4 text-body-secondary flex-shrink-0" aria-hidden="true"></i>
				<div class="min-w-0 flex-grow-1">
					{@render entryMeta(entry, index)}
					<div class="markdown mt-2">{@html entry.comment.bodyHtml}</div>
				</div>
			{:else}
				{@render entryMeta(entry, index)}
				{@render noteBody(entry.note)}
			{/if}
		</article>
	{/each}
</div>

{#snippet noteBody(note: RenderedWorkNote)}
	{#if editingId === note.id}
		<div class="d-flex flex-column gap-2">
			<textarea
				class="form-control"
				rows="3"
				bind:value={draft}
				placeholder="Update the work note…"
				aria-label="Edit work note"
			></textarea>
			<div class="d-flex justify-content-end gap-1">
				<Button color="link" size="sm" class="text-decoration-none" onclick={cancelEdit}>
					Cancel
				</Button>
				<Button
					color="primary"
					size="sm"
					onclick={() => saveEdit(note.id)}
					disabled={draft.trim().length === 0}
				>
					Save
				</Button>
			</div>
		</div>
	{:else}
		<div class="markdown">
			{@html note.bodyHtml}
		</div>
	{/if}
{/snippet}

<style>
	.activity-meta {
		font-size: 0.875rem;
	}
</style>
