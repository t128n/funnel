<script module lang="ts">
	/**
	 * Bugzilla comment anchor for a zero-based timeline index: `#c1` first.
	 */
	export function commentNumber(index: number): string {
		return `#c${index + 1}`;
	}
</script>

<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import * as Bubble from '#lib/components/ui/bubble';
	import { Button } from '#lib/components/ui/button';
	import * as Message from '#lib/components/ui/message';
	import { Textarea } from '#lib/components/ui/textarea';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { RenderedComment, RenderedWorkNote } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import LockIcon from '@lucide/svelte/icons/lock';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SendIcon from '@lucide/svelte/icons/send';
	import TrashIcon from '@lucide/svelte/icons/trash-2';

	/**
	 * The issue activity timeline: GitHub comments and internal work notes,
	 * merged in chronological order. Compact mode is the Bugzilla thread —
	 * numbered `#cN` anchors over a grey header bar and a mono body; `bubbles`
	 * keeps the chat-style rendering. Work notes are Funnel-local and render
	 * with an amber internal rule, plus edit/delete/publish actions for their
	 * author.
	 */
	interface Props {
		comments: RenderedComment[];
		workNotes: RenderedWorkNote[];
		bubbles?: boolean;
		/** Restrict the timeline to one channel; defaults to both merged. */
		filter?: 'all' | 'comments' | 'notes';
		/** GitHub login of the signed-in viewer; enables note authoring actions. */
		viewerLogin?: string | null;
		/** Login of the issue reporter; tints their comments in compact mode. */
		reporterLogin?: string | null;
		/** Hide edit/publish/delete affordances (RBAC `read`). */
		readonly?: boolean;
		/** `note:<id>` while a note mutation is in flight. */
		busyId?: string | null;
		/** Focus the composer for this entry (compact mode reply link). */
		onreply?: (id: string) => void;
		onedit: (id: string, body: string) => void;
		ondelete: (id: string) => void;
		onpublish: (id: string) => void;
	}

	let {
		comments,
		workNotes,
		bubbles = false,
		filter = 'all',
		viewerLogin = null,
		reporterLogin = null,
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

{#if bubbles}
	<ul class="flex flex-col gap-4">
		{#each entries as entry (entry.kind === 'comment' ? `c${entry.comment.externalId}` : entry.note.id)}
			{#if entry.kind === 'comment'}
				<li>
					<Message.Root>
						<Message.Avatar>
							<Avatar
								login={entry.comment.author?.login ?? 'ghost'}
								avatarUrl={entry.comment.author?.avatarUrl}
								size={32}
							/>
						</Message.Avatar>
						<Message.Content>
							<Message.Header class="gap-2">
								<strong class="text-foreground font-medium">
									{entry.comment.author?.login ?? 'ghost'}
								</strong>
								<span title={absoluteTime(entry.comment.createdAt)}>
									{timeAgo(entry.comment.createdAt)}
								</span>
							</Message.Header>
							<Bubble.Root variant="muted">
								<Bubble.Content class="markdown text-sm">
									{@html entry.comment.bodyHtml}
								</Bubble.Content>
							</Bubble.Root>
						</Message.Content>
					</Message.Root>
				</li>
			{:else}
				<li>
					<Message.Root>
						<Message.Avatar>
							<Avatar
								login={entry.note.author?.login ?? 'ghost'}
								avatarUrl={entry.note.author?.avatarUrl}
								size={32}
							/>
						</Message.Avatar>
						<Message.Content>
							<Message.Header class="gap-2">
								<strong class="text-foreground font-medium">
									{entry.note.author?.login ?? 'ghost'}
								</strong>
								<span class="text-warning inline-flex items-center gap-1">
									<LockIcon class="size-3" />
									Internal note
								</span>
								<span title={absoluteTime(entry.note.createdAt)}>
									{timeAgo(entry.note.createdAt)}
								</span>
							</Message.Header>
							{@render noteBody(entry.note, true)}
						</Message.Content>
					</Message.Root>
				</li>
			{/if}
		{/each}
	</ul>
{:else}
	<div class="flex flex-col gap-3">
		{#each entries as entry, index (entry.kind === 'comment' ? `c${entry.comment.externalId}` : entry.note.id)}
			{@const author = entry.kind === 'comment' ? entry.comment.author : entry.note.author}
			{@const at = entry.kind === 'comment' ? entry.comment.createdAt : entry.note.createdAt}
			{@const tone =
				entry.kind === 'note'
					? 'note'
					: reporterLogin && author?.login === reporterLogin
						? 'reporter'
						: undefined}
			<article class={cn('bug-comment', entry.kind === 'note' && 'is-internal')} data-index={index} data-tone={tone}>
				<header class="bug-comment-head">
					<a
						id={`c${index + 1}`}
						href={`#c${index + 1}`}
						class="mono link font-semibold">{commentNumber(index)}</a
					>
					<strong class="font-semibold">{author?.login ?? 'ghost'}</strong>
					{#if entry.kind === 'note'}
						<span class="flag flag-warning">Internal</span>
					{/if}
					<span class="text-muted-foreground" title={absoluteTime(at)}>{timeAgo(at)}</span>
					{#if onreply}
						<button type="button" class="link" onclick={() => onreply(entryId(entry))}>
							reply
						</button>
					{/if}
					{#if entry.kind === 'note' && !readonly && viewerLogin && entry.note.author?.login === viewerLogin}
						<span class="ml-auto flex items-center gap-2">
							<button
								type="button"
								class="link disabled:pointer-events-none disabled:opacity-50"
								disabled={busyId === `note:${entry.note.id}`}
								title="Edit note"
								onclick={() => startEdit(entry.note)}
							>
								Edit
							</button>
							<button
								type="button"
								class="link disabled:pointer-events-none disabled:opacity-50"
								title="Publish to GitHub as a comment (removes the note)"
								disabled={busyId === `note:${entry.note.id}`}
								onclick={() => onpublish(entry.note.id)}
							>
								Publish
							</button>
							<button
								type="button"
								class="link disabled:pointer-events-none disabled:opacity-50"
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
					<div class="bug-comment-body markdown">{@html entry.comment.bodyHtml}</div>
				{:else}
					{@render noteBody(entry.note, false)}
				{/if}
			</article>
		{/each}
	</div>
{/if}

{#snippet noteBody(note: RenderedWorkNote, bubbled: boolean)}
	{#if editingId === note.id}
		<div class="flex flex-col gap-2 p-2">
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
		<div
			class={cn(
				'flex flex-col gap-2',
				bubbled
					? 'border-warning/30 bg-warning/[0.06] rounded-lg border px-3 py-2'
					: 'contents'
			)}
		>
			<div
				class={bubbled
					? 'markdown text-foreground text-sm'
					: 'bug-comment-body markdown px-2 py-2'}
			>
				{@html note.bodyHtml}
			</div>
			{#if bubbled}
				<div class="text-muted-foreground flex items-center gap-2 text-[11px]">
					{#if !readonly && viewerLogin && note.author?.login === viewerLogin}
						<div class="ml-auto flex items-center gap-0.5">
							<Button
								variant="ghost"
								size="icon-xs"
								title="Edit note"
								aria-label="Edit note"
								disabled={busyId === `note:${note.id}`}
								onclick={() => startEdit(note)}
							>
								<PencilIcon />
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								title="Publish to GitHub as a comment (removes the note)"
								aria-label="Publish note to GitHub"
								disabled={busyId === `note:${note.id}`}
								onclick={() => onpublish(note.id)}
							>
								<SendIcon />
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								title="Delete note"
								aria-label="Delete note"
								disabled={busyId === `note:${note.id}`}
								onclick={() => ondelete(note.id)}
							>
								<TrashIcon />
							</Button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}
