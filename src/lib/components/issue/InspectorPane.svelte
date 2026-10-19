<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import { selectTriggerClass } from '#lib/components/common/select-trigger';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import BlockActionDialog from '#lib/components/board/BlockActionDialog.svelte';
	import Composer from '#lib/components/detail/Composer.svelte';
	import DetailShell from '#lib/components/detail/DetailShell.svelte';
	import ActivityTimeline from '#lib/components/issue/ActivityTimeline.svelte';
	import AttachmentDropbox from '#lib/components/issue/AttachmentDropbox.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import * as Alert from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import { Textarea } from '#lib/components/ui/textarea';
	import {
		addIssueComment,
		addIssueLabels,
		addWorkNote,
		blockIssue,
		closeIssue,
		deleteAttachment,
		deleteWorkNote,
		fetchIssueDetail,
		publishWorkNote,
		removeIssueLabel,
		reopenIssue,
		unblockIssue,
		updateIssue,
		updateWorkNote,
		uploadAttachment,
		type CloseReason,
		type UpdateIssuePatch
	} from '#lib/client/mutations';
	import {
		mutate,
		notifyFailure,
		overlayKey,
		projectDetail,
		reconcileIssues,
		type IssuePatch
	} from '#lib/client/optimistic.svelte';
	import { refreshSignal } from '#lib/client/refresh';
	import type { BlockPayload } from '#lib/client/issue-actions.svelte';
	import {
		composeFunnelMetadata,
		readBlocked,
		splitFunnelMetadata,
		writeBlocked
	} from '#lib/funnel-metadata';
	import { timeAgo } from '#lib/client/clock.svelte';
	import {
		PRIORITY_OPTIONS,
		SIZE_OPTIONS,
		STATUS_OPTIONS,
		canonicalLabel,
		labelTint
	} from '#lib/labels';
	import { absoluteTime } from '#lib/time';
	import { ATTACHMENTS_FLAG, WORK_NOTES_FLAG } from '#lib/features';
	import { canWrite } from '#lib/roles';
	import { viewOf } from '#lib/issue-url';
	import type {
		AttachmentItem,
		RenderedIssueDetail,
		UserRef
	} from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CircleUserIcon from '@lucide/svelte/icons/circle-user';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import RulerIcon from '@lucide/svelte/icons/ruler';
	import SignalIcon from '@lucide/svelte/icons/signal';
	import TagIcon from '@lucide/svelte/icons/tag';
	import XIcon from '@lucide/svelte/icons/x';

	interface Props {
		repo: string;
		number: number;
		githubUrl: string;
		onclose: () => void;
		/** Fill the parent column instead of docking beside it. */
		fill?: boolean;
		/** Render comments as chat bubbles instead of the compact list. */
		commentBubbles?: boolean;
	}

	let { repo, number, githubUrl, onclose, fill = false, commentBubbles = false }: Props = $props();

	let detail = $state<RenderedIssueDetail | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let busy = $state<string | null>(null);

	/** Structured close/reopen dialog (SPEC §5.2.3). */
	let dialogMode = $state<'close' | 'reopen' | null>(null);
	let resolveError = $state<string | null>(null);
	/** Status chosen while reopening from Done; applied after the note. */
	let pendingStatus = $state<string | null>(null);

	let title = $state('');
	let body = $state('');
	let comment = $state('');
	let editingBody = $state(false);
	/** Raw Markdown the server-rendered `bodyHtml` was produced from. */
	let renderedBody = $state('');
	/** The trailing `funnel_metadata` envelope, kept out of the body editor. */
	let metadataBlock = $state<string | null>(null);

	/** Footer composer channel: a GitHub comment or an internal work note. */
	let composerMode = $state<'comment' | 'note'>('comment');
	/** In-flight Funnel-local note mutation, e.g. `note:<uuid>`. */
	let noteBusy = $state<string | null>(null);
	/** Attachments still uploading (drives the dropbox label). */
	let uploading = $state(0);
	/** Attachment being deleted. */
	let deletingId = $state<string | null>(null);

	// Feature flags are shared per-browser; the local features default to on so a
	// missing flag never hides the journal or the dropbox.
	const featureFlags = $derived(
		(page.data as { features?: Record<string, boolean> }).features ?? {}
	);
	const workNotesEnabled = $derived(featureFlags[WORK_NOTES_FLAG] ?? true);
	const attachmentsEnabled = $derived(featureFlags[ATTACHMENTS_FLAG] ?? true);
	const viewerLogin = $derived(
		(page.data as { viewerGithub?: { login?: string } | null }).viewerGithub?.login ?? null
	);
	/** RBAC: `read` viewers see the issue but cannot edit it. */
	const mayWrite = $derived(
		canWrite((page.data as { user?: { role?: unknown } }).user?.role)
	);

	/** Structured block/unblock dialog (SPEC §5.1). */
	let blockedDialogMode = $state<'block' | 'unblock' | null>(null);
	let blockError = $state<string | null>(null);

	// `detail` is the raw fetched payload; `issue` reflects pending overlays so
	// optimistic edits show instantly and reconcile on the next SSE refresh.
	const issue = $derived(projectDetail(detail)?.issue ?? null);
	const titleDirty = $derived(issue !== null && title.trim() !== issue.title);
	const bodyDirty = $derived(detail !== null && body !== renderedBody);
	/** The structured `blocked` state parsed from the body metadata. */
	const blockedState = $derived(readBlocked(detail?.body ?? ''));
	// A just-saved body is not in the mirror yet, so its HTML is stale; fall
	// back to plain text until the SSE refresh delivers a fresh render.
	const bodyHtml = $derived(
		detail !== null && splitFunnelMetadata(detail.body).content === renderedBody
			? detail.bodyHtml
			: null
	);

	/** Done is the closed state; the pill surfaces it beside the open statuses. */
	const closed = $derived(issue?.state === 'closed');
	const statusOptions = [
		...STATUS_OPTIONS,
		{ value: 'done', label: 'Done', color: 'var(--syntax-constant)' }
	];
	const statusValue = $derived(closed ? 'done' : (issue?.status ?? null));
	const priorityValue = $derived(issue?.priority ?? null);
	const sizeValue = $derived(issue?.size ?? null);

	/** Done has no canonical label, so tint its pill explicitly. */
	const statusTint = $derived(
		closed ? 'color: var(--syntax-constant)' : labelTint(issue?.status ?? null)
	);

	const assigneeLogins = $derived(issue?.assignees.map((a) => a.login) ?? []);
	const assignees = $derived(issue?.assignees ?? []);
	const assigneeOptions = $derived(detail?.assigneeOptions ?? []);
	const selectedLabels = $derived(
		(issue?.labels ?? []).filter((name) => !canonicalLabel(name))
	);
	const labelOptions = $derived(
		(detail?.repoLabels ?? [])
			.filter((label) => !canonicalLabel(label.name))
			.map((label) => ({ value: label.name, label: label.name, color: label.color }))
	);

	const githubLink = $derived(`${githubUrl}/${repo}/issues/${number}`);
	/** Only show the composer once the issue has loaded. */
	const canEdit = $derived(issue !== null && detail !== null);
	/** Split into the two-column layout only when the side column has content. */
	const hasAside = $derived(canEdit && (workNotesEnabled || attachmentsEnabled));

	/** Guards against an out-of-order fetch clobbering a newer one. */
	let loadSeq = 0;

	async function load() {
		const seq = ++loadSeq;
		loading = true;
		error = null;
		const result = await fetchIssueDetail(repo, number);
		if (seq !== loadSeq) return;
		if (result.ok) {
			// Reconcile against the raw fetch, then bake any still-pending overlay
			// into `detail` so a later page-side reconcile cannot expose stale
			// fields here. A fetch that predates the mirror catching up is masked.
			reconcileIssues([result.value.issue]);
			const projected = projectDetail(result.value) ?? result.value;
			detail = projected;
			title = projected.issue.title;
			const split = splitFunnelMetadata(projected.body);
			body = split.content;
			renderedBody = split.content;
			metadataBlock = split.block;
			editingBody = false;
		} else {
			detail = null;
			error = result.error;
		}
		loading = false;
	}

	// Refetch when the selection changes or the server reports a change.
	$effect(() => {
		void repo;
		void number;
		void $refreshSignal;
		void load();
	});

	/** Fold a just-confirmed patch into the local detail (see `load`). */
	function bake(patch: IssuePatch): void {
		if (detail) detail = { ...detail, issue: { ...detail.issue, ...patch } };
	}

	function localAssignee(login: string): UserRef {
		return (
			assigneeOptions.find((u) => u.login === login) ?? {
				githubId: 0,
				login,
				avatarUrl: ''
			}
		);
	}

	function localAssigneeList(logins: string[]): UserRef[] {
		return logins.map(localAssignee);
	}

	/** Translate a wire patch into the camelCase fields an overlay carries. */
	function toIssuePatch(patch: UpdateIssuePatch): IssuePatch {
		const next: IssuePatch = {};
		if (patch.title !== undefined) next.title = patch.title;
		if (patch.status !== undefined) next.status = patch.status;
		if (patch.priority !== undefined) next.priority = patch.priority;
		if (patch.size !== undefined) next.size = patch.size;
		if (patch.blocked !== undefined) next.blocked = patch.blocked;
		if (patch.assignees !== undefined) {
			next.assignees = localAssigneeList(patch.assignees);
		}
		if (patch.state !== undefined) {
			next.state = patch.state;
			if (patch.state === 'closed') next.closedAt = Date.now();
			else if (patch.state === 'open') next.closedAt = null;
		}
		if (patch.state_reason !== undefined) next.stateReason = patch.state_reason;
		return next;
	}

	async function runPatch(patch: UpdateIssuePatch, op: string): Promise<boolean> {
		if (!detail) return false;
		busy = op;
		const issuePatch = toIssuePatch(patch);
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: issuePatch,
			failure: 'Could not update issue',
			commit: () => updateIssue(repo, number, patch)
		});
		busy = null;
		if (!outcome.ok) return false;
		bake(issuePatch);
		// The body lives only in the detail payload, so reflect it locally.
		if (patch.body !== undefined) {
			detail = { ...detail, body: patch.body };
			body = patch.body;
		}
		return true;
	}

	function openDialog(mode: 'close' | 'reopen', status: string | null = null) {
		resolveError = null;
		pendingStatus = status;
		dialogMode = mode;
	}

	/**
	 * Close with a required resolution: note comment first, then the state
	 * change. The dialog renders failures inline, so it opts out of the toast.
	 */
	async function confirmClose(payload: { reason: CloseReason; note: string }) {
		if (!detail) return;
		busy = 'close';
		resolveError = null;
		const issuePatch: IssuePatch = {
			state: 'closed',
			stateReason: payload.reason,
			closedAt: Date.now()
		};
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: issuePatch,
			failure: 'Could not close issue',
			notify: false,
			commit: () => closeIssue(repo, number, payload.reason, payload.note)
		});
		busy = null;
		if (!outcome.ok) {
			resolveError = outcome.error;
			return;
		}
		bake(issuePatch);
		dialogMode = null;
	}

	/** Reopen with a required note, posted as a comment before the state change. */
	async function confirmReopen(payload: { reason: CloseReason; note: string }) {
		if (!detail) return;
		busy = 'reopen';
		resolveError = null;
		const issuePatch: IssuePatch = {
			state: 'open',
			stateReason: null,
			closedAt: null,
			...(pendingStatus ? { status: pendingStatus } : {})
		};
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: issuePatch,
			failure: 'Could not reopen issue',
			notify: false,
			commit: () =>
				reopenIssue(repo, number, payload.note, pendingStatus ?? undefined)
		});
		busy = null;
		if (!outcome.ok) {
			resolveError = outcome.error;
			return;
		}
		bake(issuePatch);
		pendingStatus = null;
		dialogMode = null;
	}

	async function saveTitle() {
		if (!titleDirty || busy) return;
		await runPatch({ title: title.trim() }, 'title');
	}

	async function saveBody() {
		if (!bodyDirty || busy) return;
		// The `funnel_metadata` envelope is hidden from the editor; re-attach it
		// verbatim so editing the description never drops it.
		const ok = await runPatch({ body: composeFunnelMetadata(body, metadataBlock) }, 'body');
		if (ok) {
			renderedBody = body;
			editingBody = false;
		}
	}

	function cancelBody() {
		body = renderedBody;
		editingBody = false;
	}

	function onBodyKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void saveBody();
		}
	}

	async function setStatus(value: string | null) {
		if (!value) return;
		// Done is a state transition: reuse the structured close dialog rather
		// than writing a label (SPEC §5.2.3).
		if (value === 'done') {
			openDialog('close');
			return;
		}
		// Leaving Done reopens the issue, which requires a note; carry the chosen
		// status through the dialog so it applies after the state change.
		if (closed) {
			openDialog('reopen', value);
			return;
		}
		// Triage from the Inbox: setting the first status moves the issue out of
		// the queue (see `projectInboxEntries`). Confirm the exit with an undo,
		// since the row leaves immediately and the picker is the only feedback.
		const wasUntriaged = issue?.status == null;
		const ok = await runPatch({ status: value }, 'status');
		if (ok && wasUntriaged && viewOf(page.url.pathname) === 'inbox') {
			toast('Triaged · moved to Issues', {
				description: `${repo}#${number}`,
				duration: 6000,
				action: {
					label: 'Undo',
					onClick: () => void runPatch({ status: null }, 'status')
				}
			});
		}
	}

	async function setPriority(value: string | null) {
		await runPatch({ priority: value }, 'priority');
	}

	async function setSize(value: string | null) {
		await runPatch({ size: value }, 'size');
	}

	/** Open the structured block/unblock dialog (SPEC §5.1). */
	function openBlockDialog(mode: 'block' | 'unblock') {
		if (!issue) return;
		blockError = null;
		blockedDialogMode = mode;
	}

	/**
	 * Record the blocker (or its resolution) as a comment and in the body
	 * metadata, then apply the flag. The overlay flips the indicator at once and
	 * rolls back on failure, with the error shown inline in the dialog.
	 */
	async function confirmBlocked(payload: BlockPayload) {
		if (!detail) return;
		busy = 'blocked';
		blockError = null;
		const blocked = payload.kind === 'block';
		const current = detail.body;
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: { blocked },
			failure: blocked ? 'Could not block issue' : 'Could not unblock issue',
			notify: false,
			commit: () =>
				payload.kind === 'block'
					? blockIssue(repo, number, current, payload.info)
					: unblockIssue(repo, number, current, payload.note)
		});
		busy = null;
		if (!outcome.ok) {
			blockError = outcome.error;
			return;
		}
		const nextBody =
			payload.kind === 'block' ? writeBlocked(current, payload.info) : writeBlocked(current, null);
		detail = { ...detail, body: nextBody, issue: { ...detail.issue, blocked } };
		metadataBlock = splitFunnelMetadata(nextBody).block;
		blockedDialogMode = null;
	}

	async function setAssignees(logins: string[]) {
		await runPatch({ assignees: logins }, 'assignees');
	}

	async function setLabels(next: string[]) {
		if (!detail) return;
		const current = new Set(selectedLabels);
		const target = new Set(next);
		const added = next.filter((name) => !current.has(name));
		const removed = [...selectedLabels].filter((name) => !target.has(name));
		if (added.length === 0 && removed.length === 0) return;

		const reserved = detail.issue.labels.filter((name) => canonicalLabel(name));
		const issuePatch: IssuePatch = { labels: [...reserved, ...next] };
		busy = 'labels';
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: issuePatch,
			failure: 'Could not update labels',
			commit: async () => {
				if (added.length > 0) {
					const result = await addIssueLabels(repo, number, added);
					if (!result.ok) return result;
				}
				for (const name of removed) {
					const result = await removeIssueLabel(repo, number, name);
					if (!result.ok) return { ok: false as const, error: result.error };
				}
				return { ok: true as const, value: { labels: next } };
			}
		});
		busy = null;
		if (outcome.ok) bake(issuePatch);
	}

	async function submitComment() {
		const text = comment.trim();
		if (!text || busy) return;
		busy = 'comment';
		const result = await addIssueComment(repo, number, text);
		busy = null;
		if (!result.ok) {
			notifyFailure('Could not post comment', result.error);
			return;
		}
		comment = '';
		// The mirror updates in the background; refetch to show the new comment.
		await load();
	}

	/** Create an internal work note from the shared composer draft. */
	async function submitWorkNote() {
		const text = comment.trim();
		if (!text || noteBusy) return;
		noteBusy = 'note:new';
		const result = await addWorkNote(repo, number, text);
		noteBusy = null;
		if (!result.ok) {
			notifyFailure('Could not add work note', result.error);
			return;
		}
		comment = '';
		await load();
	}

	function submitComposer() {
		if (composerMode === 'note') void submitWorkNote();
		else void submitComment();
	}

	async function editWorkNote(id: string, text: string) {
		noteBusy = `note:${id}`;
		const result = await updateWorkNote(repo, number, id, text);
		noteBusy = null;
		if (!result.ok) {
			notifyFailure('Could not update work note', result.error);
			return;
		}
		await load();
	}

	async function removeWorkNote(id: string) {
		noteBusy = `note:${id}`;
		const result = await deleteWorkNote(repo, number, id);
		noteBusy = null;
		if (!result.ok) {
			notifyFailure('Could not delete work note', result.error);
			return;
		}
		await load();
	}

	async function publishNote(id: string) {
		noteBusy = `note:${id}`;
		const result = await publishWorkNote(repo, number, id);
		noteBusy = null;
		if (!result.ok) {
			notifyFailure('Could not publish work note', result.error);
			return;
		}
		toast('Work note published as a comment');
		await load();
	}

	async function uploadFiles(files: File[]) {
		if (files.length === 0) return;
		uploading += files.length;
		let changed = false;
		for (const file of files) {
			const result = await uploadAttachment(repo, number, file);
			if (result.ok) changed = true;
			else notifyFailure(`Could not upload ${file.name}`, result.error);
		}
		uploading -= files.length;
		if (changed) await load();
	}

	async function removeAttachment(item: AttachmentItem) {
		if (deletingId) return;
		deletingId = item.id;
		const result = await deleteAttachment(item.id);
		deletingId = null;
		if (!result.ok) {
			notifyFailure('Could not delete attachment', result.error);
			return;
		}
		await load();
	}
</script>

{#snippet composer()}
	<Composer
		bind:value={comment}
		bind:mode={composerMode}
		busy={busy === 'comment' || noteBusy === 'note:new'}
		label="Comment"
		showModeToggle={workNotesEnabled}
		onattach={attachmentsEnabled ? (files) => void uploadFiles(files) : undefined}
		onsubmit={submitComposer}
	/>
{/snippet}

{#snippet aside()}
	{#if detail}
		{#if workNotesEnabled}
			<section class="flex flex-col gap-3" aria-label="Work notes">
				<div class="flex items-center justify-between">
					<h2 class="text-foreground text-base font-semibold">Work notes</h2>
					<span class="mono text-muted-foreground text-xs">{detail.workNotes.length}</span>
				</div>
				{#if detail.workNotes.length === 0}
					<div
						class="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs"
					>
						No work notes yet. Internal notes stay in Funnel unless you publish them.
					</div>
				{:else}
					<ActivityTimeline
						comments={[]}
						workNotes={detail.workNotes}
						filter="notes"
						viewerLogin={viewerLogin}
						readonly={!mayWrite}
						busyId={noteBusy}
						onedit={editWorkNote}
						ondelete={removeWorkNote}
						onpublish={publishNote}
					/>
				{/if}
			</section>
		{/if}

		{#if attachmentsEnabled}
			<AttachmentDropbox
				attachments={detail.attachments}
				uploading={uploading}
				busyId={deletingId}
				readonly={!mayWrite}
				onupload={(files) => void uploadFiles(files)}
				ondelete={(item) => void removeAttachment(item)}
			/>
		{/if}
	{/if}
{/snippet}

<DetailShell
	ariaLabel="Issue inspector"
	class={cn(
		fill
			? 'min-w-0 flex-1 border-l-0'
			: 'w-120 border-l max-[1100px]:absolute max-[1100px]:inset-y-0 max-[1100px]:right-0 max-[1100px]:z-40 max-[1100px]:w-[min(480px,100%)] max-[1100px]:shadow-lg'
	)}
	contentKey={`${repo}#${number}:${detail?.bodyHtml ?? ''}:${detail?.comments.length ?? 0}:${detail?.workNotes.length ?? 0}`}
	wide={fill}
	aside={hasAside ? aside : undefined}
	footer={canEdit && mayWrite ? composer : undefined}
>
	{#snippet header()}
		<div class="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
			{#if issue}
				<div class="flex min-w-0 items-center gap-2">
					<Input
						class="hover:bg-accent/50 h-auto -ml-1 min-w-0 flex-1 rounded-sm border-0 bg-transparent px-1 text-xl leading-tight font-semibold tracking-tight shadow-none md:text-xl dark:bg-transparent"
						value={title}
						oninput={(e) => (title = e.currentTarget.value)}
						onblur={saveTitle}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								e.currentTarget.blur();
							}
						}}
						aria-label="Issue title"
						disabled={busy === 'title' || !mayWrite}
					/>
					{#if busy === 'title'}
						<Spinner size={14} />
					{:else if titleDirty}
						<Button variant="secondary" size="sm" onclick={saveTitle}>Save</Button>
					{/if}
				</div>
			{/if}
			<div class="text-muted-foreground flex min-w-0 items-center gap-3 text-xs">
				<span class="min-w-0 truncate font-medium" title={`${repo}#${number}`}>
					{repo}#{number}
				</span>
				{#if issue}
					{#if issue.author}
						<span class="truncate">
							opened by <strong class="text-foreground font-medium">{issue.author.login}</strong>
						</span>
					{/if}
					<span class="shrink-0" title={absoluteTime(issue.createdAt)}>
						{timeAgo(issue.createdAt)}
					</span>
					<span class="shrink-0" title={absoluteTime(issue.updatedAt)}>
						last updated {timeAgo(issue.updatedAt)}
					</span>
				{/if}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<Button
				variant="ghost"
				size="icon-sm"
				href={githubLink}
				target="_blank"
				rel="noreferrer"
				title="Open on GitHub"
			>
				<ExternalLinkIcon />
			</Button>
			<Button variant="ghost" size="icon-sm" title="Close inspector" onclick={onclose}>
				<XIcon />
			</Button>
		</div>
	{/snippet}

	{#if loading && !detail}
		<div class="text-muted-foreground flex flex-1 items-center justify-center p-6">
			<Spinner size={16} label="Loading issue" />
		</div>
	{:else if error}
		<div class="flex flex-1 items-start justify-center">
			<Alert.Root variant="destructive">
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		</div>
	{:else if issue && detail}
		{#if issue.labelConflict}
			<Alert.Root>
				<Alert.Description>
					Conflicting reserved labels were detected on GitHub; the mirror used the latest
					timeline entry.
				</Alert.Description>
			</Alert.Root>
		{/if}

		<section class="flex flex-col" aria-label="Description">
			{#if editingBody}
				<Textarea
					class="min-h-32"
					value={body}
					oninput={(e) => (body = e.currentTarget.value)}
					onkeydown={onBodyKeydown}
					placeholder="Describe the issue…"
					rows={6}
				></Textarea>
				<div class="mt-2 flex items-center justify-end gap-1">
					{#if busy === 'body'}
						<Spinner size={13} />
					{:else}
						<Button variant="ghost" size="xs" onclick={cancelBody}>Cancel</Button>
						<Button variant="secondary" size="xs" onclick={saveBody} disabled={!bodyDirty}>
							Save
						</Button>
					{/if}
				</div>
			{:else}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class={cn(
						'-mx-2 min-h-12 px-2 py-1 text-sm leading-relaxed text-foreground',
						mayWrite && 'hover:bg-accent/40 cursor-text transition-colors',
						bodyHtml !== null && 'markdown',
						bodyHtml === null && 'plain-text'
					)}
					role={mayWrite ? 'button' : undefined}
					tabindex={mayWrite ? 0 : undefined}
					aria-label={mayWrite ? 'Issue description; activate to edit' : 'Issue description'}
					onclick={() => mayWrite && (editingBody = true)}
					onkeydown={(e) => {
						if (mayWrite && (e.key === 'Enter' || e.key === ' ')) {
							e.preventDefault();
							editingBody = true;
						}
					}}
				>
					{#if body.trim().length === 0}
						<span class="text-muted-foreground">Add a description…</span>
					{:else if bodyHtml !== null}
						{@html bodyHtml}
					{:else}
						{body}
					{/if}
				</div>
			{/if}
		</section>

		<section class="flex flex-wrap items-center gap-1.5" aria-label="Issue properties">
			<button
				class={selectTriggerClass(
					'pill',
					cn(
						'gap-1.5',
						issue?.blocked &&
							'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
					)
				)}
				onclick={() => openBlockDialog(issue?.blocked ? 'unblock' : 'block')}
				disabled={busy === 'blocked' || !canEdit || !mayWrite}
				title="Blocked flag"
				aria-pressed={issue?.blocked ?? false}
			>
				<BanIcon class="size-3.5" />
				Blocked
			</button>

			<SingleSelect
				variant="pill"
				label="No status"
				options={statusOptions}
				value={statusValue}
				onselect={setStatus}
				disabled={busy === 'status' || !mayWrite}
			>
				{#snippet icon()}
					<CircleDashedIcon class="size-3.5" style={statusTint} />
				{/snippet}
			</SingleSelect>

			<SingleSelect
				variant="pill"
				label="No priority"
				options={PRIORITY_OPTIONS}
				value={priorityValue}
				onselect={setPriority}
				allowClear
				disabled={busy === 'priority' || !mayWrite}
			>
				{#snippet icon()}
					<SignalIcon class="size-3.5" style={labelTint(priorityValue)} />
				{/snippet}
			</SingleSelect>

			<SingleSelect
				variant="pill"
				label="No size"
				options={SIZE_OPTIONS}
				value={sizeValue}
				onselect={setSize}
				allowClear
				disabled={busy === 'size' || !mayWrite}
			>
				{#snippet icon()}
					<RulerIcon class="size-3.5" style={labelTint(sizeValue)} />
				{/snippet}
			</SingleSelect>

			<MultiSelect
				variant="pill"
				hideCount
				label="Assignee"
				placeholder="Unassigned"
				display="selection"
				options={assigneeOptions.map((u) => ({ value: u.login, label: u.login }))}
				selected={assigneeLogins}
				onselect={setAssignees}
				disabled={busy === 'assignees' || !mayWrite}
			>
				{#snippet icon()}
					{@const first = assignees[0]}
					{#if first}
						<Avatar login={first.login} avatarUrl={first.avatarUrl} size={16} />
					{:else}
						<CircleUserIcon class="size-3.5" />
					{/if}
				{/snippet}
			</MultiSelect>

			<MultiSelect
				variant="pill"
				hideCount
				label="Labels"
				placeholder="No labels"
				display="selection"
				options={labelOptions}
				selected={selectedLabels}
				onselect={setLabels}
				disabled={busy === 'labels' || !mayWrite}
			>
				{#snippet icon()}
					<TagIcon class="size-3.5" />
				{/snippet}
			</MultiSelect>
		</section>

		{#if blockedState.isBlocked && blockedState.info}
			<section
				class="border-destructive/30 bg-destructive/5 flex flex-col gap-1 rounded-lg border p-3 text-xs"
				aria-label="Blocker"
			>
				<div class="text-destructive flex items-center gap-1.5 font-medium">
					<BanIcon class="size-3.5" />
					Blocked
					{#if blockedState.info.recheck}
						<span class="text-muted-foreground ml-auto font-normal">
							Re-check {blockedState.info.recheck}
						</span>
					{/if}
				</div>
				<p class="text-foreground">{blockedState.info.blocker}</p>
				{#if blockedState.info.needs}
					<p class="text-muted-foreground">
						<span class="font-medium">Needs to unblock:</span>
						{blockedState.info.needs}
					</p>
				{/if}
				{#if blockedState.info.trying}
					<p class="text-muted-foreground">
						<span class="font-medium">Currently trying:</span>
						{blockedState.info.trying}
					</p>
				{/if}
			</section>
		{/if}

		<section class="flex flex-col gap-3" aria-label="Activity">
			<div class="flex items-center justify-between">
				<h2 class="text-foreground text-base font-semibold">
					Activity
				</h2>
				<span class="mono text-muted-foreground text-xs">{detail.comments.length}</span>
			</div>
			{#if detail.comments.length === 0}
				<div
					class="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs"
				>
					No comments yet.
				</div>
			{:else}
				<ActivityTimeline
					comments={detail.comments}
					workNotes={[]}
					filter="comments"
					bubbles={commentBubbles}
					readonly={!mayWrite}
					onedit={editWorkNote}
					ondelete={removeWorkNote}
					onpublish={publishNote}
				/>
			{/if}
		</section>
	{/if}
</DetailShell>

<IssueActionDialog
	open={dialogMode !== null}
	mode={dialogMode ?? 'close'}
	busy={busy === 'close' || busy === 'reopen'}
	error={resolveError}
	onopenchange={(open) => {
		if (!open && busy === null) {
			dialogMode = null;
			pendingStatus = null;
		}
	}}
	onconfirm={(payload) => {
		if (dialogMode === 'reopen') void confirmReopen(payload);
		else void confirmClose(payload);
	}}
/>

<BlockActionDialog
	open={blockedDialogMode !== null}
	mode={blockedDialogMode ?? 'block'}
	busy={busy === 'blocked'}
	error={blockError}
	onopenchange={(open) => {
		if (!open && busy === null) {
			blockedDialogMode = null;
			blockError = null;
		}
	}}
	onconfirm={(payload) => void confirmBlocked(payload)}
/>
