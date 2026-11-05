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
	import {
		emptyReactions,
		REACTION_CONTENTS,
		REACTION_META,
		type ReactionContent
	} from '#lib/reactions';
	import { absoluteTime } from '#lib/time';
	import type {
		IssueHistoryItem,
		RenderedComment,
		RenderedWorkNote
	} from '#lib/server/issues/types';

	/**
	 * The issue activity timeline: GitHub comments, internal work notes and
	 * history entries, merged in chronological order and rendered as ruled
	 * document entries — author and time in a compact caption line, prose at
	 * 1rem/1.6. Internal notes carry a small lock label in the caption, never a
	 * filled panel. History entries are compact captions without prose.
	 */
	interface Props {
		comments: RenderedComment[];
		workNotes: RenderedWorkNote[];
		/** Local audit and mirrored GitHub timeline entries, oldest first. */
		history?: IssueHistoryItem[];
		/** Legacy chat presentation flag; ruled entries are always used. */
		bubbles?: boolean;
		/** Restrict the timeline to one channel; defaults to all three merged. */
		filter?: 'all' | 'comments' | 'notes' | 'history';
		/** GitHub login of the signed-in viewer; enables note authoring actions. */
		viewerLogin?: string | null;
		/** Login of the issue reporter; kept for API compatibility. */
		reporterLogin?: string | null;
		/** Hide edit/publish/delete affordances (RBAC `read`). */
		readonly?: boolean;
		/** Admins may delete any public comment; GitHub still decides server-side. */
		mayModerate?: boolean;
		/** `note:<id>` or `comment:<id>` while a mutation is in flight. */
		busyId?: string | null;
		/** Focus the composer for this entry (reply link). */
		onreply?: (id: string) => void;
		onedit: (id: string, body: string) => void;
		ondelete: (id: string) => void;
		onpublish: (id: string) => void;
		/** Edit one of the viewer's own GitHub comments (public lifecycle). */
		oncommentedit?: (id: string, body: string) => void;
		/** Delete one of the viewer's own comments, or any comment as an admin. */
		oncommentdelete?: (id: string) => void;
		/** Add (`active: true`) or remove one reaction on a public comment. */
		onreaction?: (id: string, content: ReactionContent, active: boolean) => void;
	}

	let {
		comments,
		workNotes,
		history = [],
		bubbles: _bubbles = false,
		filter = 'all',
		viewerLogin = null,
		reporterLogin: _reporterLogin = null,
		readonly = false,
		mayModerate = false,
		busyId = null,
		onreply,
		onedit,
		ondelete,
		onpublish,
		oncommentedit,
		oncommentdelete,
		onreaction
	}: Props = $props();

	type Entry =
		| { kind: 'comment'; at: number; comment: RenderedComment }
		| { kind: 'note'; at: number; note: RenderedWorkNote }
		| { kind: 'history'; at: number; history: IssueHistoryItem };

	const entries = $derived(
		[
			...(filter === 'notes' || filter === 'history'
				? []
				: comments.map((comment): Entry => ({ kind: 'comment', at: comment.createdAt, comment }))),
			...(filter === 'comments' || filter === 'history'
				? []
				: workNotes.map((note): Entry => ({ kind: 'note', at: note.createdAt, note }))),
			...(filter === 'comments' || filter === 'notes'
				? []
				: history.map(
						(entry): Entry => ({ kind: 'history', at: entry.at, history: entry })
					))
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
		if (entry.kind === 'comment') return entry.comment.externalId;
		if (entry.kind === 'note') return entry.note.id;
		return entry.history.id;
	}

	/** Comment inline editor is independent of the note editor. */
	let editingCommentId = $state<string | null>(null);
	let commentDraft = $state('');
	/** `comment:<id>` whose reaction picker is open. */
	let pickerFor = $state<string | null>(null);

	function startCommentEdit(comment: RenderedComment) {
		editingCommentId = comment.externalId;
		commentDraft = comment.body;
	}

	function cancelCommentEdit() {
		editingCommentId = null;
		commentDraft = '';
	}

	function saveCommentEdit(id: string) {
		const body = commentDraft.trim();
		if (body.length === 0) return;
		oncommentedit?.(id, body);
		editingCommentId = null;
		commentDraft = '';
	}

	function reactionsFor(comment: RenderedComment) {
		return comment.reactions ?? emptyReactions();
	}

	function reactionCount(comment: RenderedComment, content: ReactionContent): number {
		return reactionsFor(comment).counts[content] ?? 0;
	}

	function hasReacted(comment: RenderedComment, content: ReactionContent): boolean {
		return reactionsFor(comment).viewerReacted.includes(content);
	}

	function toggleReaction(comment: RenderedComment, content: ReactionContent) {
		if (readonly || !onreaction) return;
		onreaction(comment.externalId, content, !hasReacted(comment, content));
	}

	function chooseReaction(comment: RenderedComment, content: ReactionContent) {
		pickerFor = null;
		toggleReaction(comment, content);
	}
</script>

{#snippet entryMeta(entry: Entry, index: number)}
	{@const author =
		entry.kind === 'comment'
			? entry.comment.author
			: entry.kind === 'note'
				? entry.note.author
				: entry.history.actor}
	{@const at =
		entry.kind === 'comment'
			? entry.comment.createdAt
			: entry.kind === 'note'
				? entry.note.createdAt
				: entry.history.at}
	<header class="d-flex min-w-0 flex-wrap align-items-center gap-2 activity-meta text-body-secondary">
		{#if entry.kind === 'comment'}
			<a
				id={`c${index + 1}`}
				href={`#c${index + 1}`}
				class="font-monospace text-body-tertiary text-decoration-none"
				aria-label={`Comment ${commentNumber(index)}`}>{commentNumber(index)}</a
			>
			<span class="text-body fw-semibold">{author?.login ?? 'ghost'}</span>
			<span>
				commented
				<time datetime={new Date(at).toISOString()} title={absoluteTime(at)}>{timeAgo(at)}</time>
			</span>
		{:else if entry.kind === 'note'}
			<span class="text-body fw-semibold">{author?.login ?? 'ghost'}</span>
			<span class="d-inline-flex align-items-center gap-1">
				<i class="bi bi-lock flex-shrink-0" aria-hidden="true"></i>
				Internal
			</span>
			<span title={absoluteTime(at)}>{timeAgo(at)}</span>
		{:else}
			<i class="bi bi-clock-history flex-shrink-0" aria-hidden="true"></i>
			<span class="text-body fw-semibold">{author?.login ?? 'Funnel'}</span>
			<span>{entry.history.summary}</span>
			<time datetime={new Date(at).toISOString()} title={absoluteTime(at)}>{timeAgo(at)}</time>
		{/if}
		{#if onreply && entry.kind !== 'history'}
			<Button
				color="link"
				size="sm"
				class="d-inline-flex align-items-center text-decoration-none px-1 py-0"
				onclick={() => onreply(entryId(entry))}
			>
				Reply
			</Button>
		{/if}
		{#if entry.kind === 'comment' && !readonly && viewerLogin && (entry.comment.author?.login === viewerLogin || mayModerate)}
			<span class="ms-auto d-flex align-items-center gap-2">
				{#if entry.comment.author?.login === viewerLogin}
					<Button
						color="link"
						size="sm"
						class="d-inline-flex align-items-center text-decoration-none px-1 py-0"
						disabled={busyId === `comment:${entry.comment.externalId}`}
						title="Edit comment"
						onclick={() => startCommentEdit(entry.comment)}
					>
						Edit
					</Button>
				{/if}
				<Button
					color="link"
					size="sm"
					class="d-inline-flex align-items-center text-decoration-none px-1 py-0 text-body-secondary"
					title="Delete comment"
					disabled={busyId === `comment:${entry.comment.externalId}`}
					onclick={() => oncommentdelete?.(entry.comment.externalId)}
				>
					Delete
				</Button>
			</span>
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
	{#each entries as entry, index (entry.kind === 'comment'
		? `c${entry.comment.externalId}`
		: entry.kind === 'note'
			? entry.note.id
			: entry.history.id)}
		<article
			class="activity-entry {entry.kind === 'comment'
				? 'd-flex gap-3 py-3'
				: entry.kind === 'note'
					? 'd-flex flex-column gap-1 py-2'
					: 'd-flex flex-column gap-1 py-2'} {index > 0 ? 'border-top' : ''}"
			data-index={index}
			data-tone={entry.kind === 'note' ? 'note' : entry.kind === 'history' ? 'history' : undefined}
		>
			{#if entry.kind === 'comment'}
				<i class="bi bi-person-circle fs-4 text-body-secondary flex-shrink-0" aria-hidden="true"></i>
				<div class="min-w-0 flex-grow-1">
					{@render entryMeta(entry, index)}
					{#if editingCommentId === entry.comment.externalId}
						<div class="d-flex flex-column gap-2 mt-2">
							<textarea
								class="form-control"
								rows="3"
								bind:value={commentDraft}
								placeholder="Update the comment…"
								aria-label="Edit comment"
							></textarea>
							<div class="d-flex justify-content-end gap-1">
								<Button color="link" size="sm" class="text-decoration-none" onclick={cancelCommentEdit}>
									Cancel
								</Button>
								<Button
									color="primary"
									size="sm"
									onclick={() => saveCommentEdit(entry.comment.externalId)}
									disabled={commentDraft.trim().length === 0 ||
										busyId === `comment:${entry.comment.externalId}`}
								>
									Save
								</Button>
							</div>
						</div>
					{:else}
						<div class="markdown mt-2">{@html entry.comment.bodyHtml}</div>
					{/if}
					{@render reactions(entry.comment)}
				</div>
			{:else if entry.kind === 'note'}
				{@render entryMeta(entry, index)}
				{@render noteBody(entry.note)}
			{:else}
				{@render entryMeta(entry, index)}
			{/if}
		</article>
	{/each}
</div>

{#snippet reactions(comment: RenderedComment)}
	{@const busy = busyId === `comment:${comment.externalId}`}
	<div class="d-flex flex-wrap align-items-center gap-1 mt-2" aria-label="Reactions">
		{#each REACTION_CONTENTS as content (content)}
			{@const count = reactionCount(comment, content)}
			{#if count > 0}
				<button
					type="button"
					class="btn btn-sm reaction-chip d-inline-flex align-items-center gap-1 {hasReacted(
						comment,
						content
					)
						? 'btn-primary'
						: 'btn-outline-secondary'}"
					aria-pressed={hasReacted(comment, content)}
					aria-label={`${REACTION_META[content].label}, ${count}`}
					title={`${REACTION_META[content].label} · ${count}`}
					disabled={readonly || !onreaction || busy}
					onclick={() => toggleReaction(comment, content)}
				>
					<span aria-hidden="true">{REACTION_META[content].emoji}</span>
					<span class="metric-number">{count}</span>
				</button>
			{/if}
		{/each}
		{#if !readonly && onreaction}
			<div class="position-relative">
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary reaction-chip"
					aria-haspopup="true"
					aria-expanded={pickerFor === comment.externalId}
					aria-label="Add a reaction"
					title="Add a reaction"
					disabled={busy}
					onclick={() => (pickerFor = pickerFor === comment.externalId ? null : comment.externalId)}
				>
					<i class="bi bi-emoji-smile" aria-hidden="true"></i>
					<span aria-hidden="true">+</span>
				</button>
				{#if pickerFor === comment.externalId}
					<div class="reaction-menu dropdown-menu show" role="menu" aria-label="Choose a reaction">
						{#each REACTION_CONTENTS as content (content)}
							<button
								type="button"
								class="dropdown-item d-flex align-items-center gap-2"
								class:active={hasReacted(comment, content)}
								role="menuitem"
								onclick={() => chooseReaction(comment, content)}
							>
								<span aria-hidden="true">{REACTION_META[content].emoji}</span>
								<span>{REACTION_META[content].label}</span>
								{#if hasReacted(comment, content)}
									<i class="bi bi-check-lg ms-auto" aria-hidden="true"></i>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

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

	.reaction-chip {
		--bs-btn-padding-y: 0.125rem;
		--bs-btn-padding-x: 0.5rem;
		--bs-btn-font-size: 0.8125rem;
	}

	.reaction-menu {
		z-index: 1040;
		min-width: 12rem;
	}
</style>
