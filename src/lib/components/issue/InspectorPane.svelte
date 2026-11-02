<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy, tick, untrack } from 'svelte';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import RefText from '#lib/components/common/RefText.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import BlockActionDialog from '#lib/components/board/BlockActionDialog.svelte';
	import Composer from '#lib/components/detail/Composer.svelte';
	import DetailShell from '#lib/components/detail/DetailShell.svelte';
	import ActivityTimeline from '#lib/components/issue/ActivityTimeline.svelte';
	import AttachmentDropbox from '#lib/components/issue/AttachmentDropbox.svelte';
	import { severityWord } from '#lib/components/issue/bug-vocabulary';
	import DelayList from '#lib/components/issue/DelayList.svelte';
	import EpicProperty from '#lib/components/issue/EpicProperty.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import IssueTimeCard from '#lib/components/issue/IssueTimeCard.svelte';
	import MilestonePicker from '#lib/components/issue/MilestonePicker.svelte';
	import RecordDelayDialog from '#lib/components/issue/RecordDelayDialog.svelte';
	import { delayReasonLabel } from '#lib/components/issue/inspector-format';
	import PriorityPicker from '#lib/components/issue/PriorityPicker.svelte';
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
		setIssueWatching,
		unblockIssue,
		updateIssue,
		updateWorkNote,
		uploadAttachment,
		type CloseReason,
		type UpdateIssuePatch
	} from '#lib/client/mutations';
	import {
		mutate,
		overlayKey,
		projectDetail,
		reconcileIssues,
		type IssuePatch
	} from '#lib/client/optimistic.svelte';
	import { refreshSignal, type RefreshPayload } from '#lib/client/refresh';
	import type { BlockPayload } from '#lib/client/issue-actions.svelte';
	import {
		composeFunnelMetadata,
		readBlocked,
		splitFunnelMetadata,
		writeBlocked
	} from '#lib/funnel-metadata';
	import { issueThreadMarkdown, shouldScopeSelectAll } from '#lib/issue-copy';
	import { timeAgo } from '#lib/client/clock.svelte';
	import {
		SIZE_OPTIONS,
		STATUS_OPTIONS,
		canonicalLabel
	} from '#lib/labels';
	import {
		derivePriorityOrNull,
		impactLabel,
		isRetiredPriorityLabel,
		parseImpactLabel,
		parseUrgencyLabel,
		urgencyLabel
	} from '#lib/priority';
	import { absoluteTime } from '#lib/time';
	import { ATTACHMENTS_FLAG, WORK_NOTES_FLAG } from '#lib/features';
	import { canWrite } from '#lib/roles';
	import { viewOf } from '#lib/issue-url';
	import type {
		AttachmentItem,
		RenderedIssueDetail,
		RepoMilestoneRef,
		UserRef
	} from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import MilestoneIcon from '@lucide/svelte/icons/milestone';
	import UserIcon from '@lucide/svelte/icons/user';
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

	/** Matches the server default, so a first load needs no query parameter. */
	const DEFAULT_COMMENT_LIMIT = 1000;
	/** How many older comments each "Load earlier comments" step adds. */
	const COMMENT_LIMIT_STEP = 500;
	/** The server clamps the comment page to this many newest comments. */
	const MAX_COMMENT_LIMIT = 2000;

	let detail = $state<RenderedIssueDetail | null>(null);
	let loading = $state(false);
	/** Newest comments requested; grown when the thread has earlier comments. */
	let commentLimit = $state(DEFAULT_COMMENT_LIMIT);
	let error = $state<string | null>(null);
	let busy = $state<string | null>(null);
	/** Whether the viewer watches this issue (T5 surfaces it on the detail). */
	let watching = $state(false);
	let watchBusy = $state(false);

	/** Structured close/reopen dialog (SPEC §5.2.3). */
	let dialogMode = $state<'close' | 'reopen' | null>(null);
	let resolveError = $state<string | null>(null);
	/** Status chosen while reopening from Done; applied after the note. */
	let pendingStatus = $state<string | null>(null);

	let title = $state('');
	let body = $state('');
	let comment = $state('');
	let editingBody = $state(false);
	/** Whether the title shows its inline editor instead of plain text. */
	let editingTitle = $state(false);
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

	/** Pane root, so Mod+A can be scoped to this issue instead of the page. */
	let paneEl = $state<HTMLElement | null>(null);
	/** The title heading; the start of a Mod+A thread selection. */
	let titleEl = $state<HTMLElement | null>(null);
	/** The Activity section; the end of a Mod+A thread selection. */
	let activityEl = $state<HTMLElement | null>(null);
	/** Flips the copy button to a check for a moment after a successful copy. */
	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Inline write feedback. Issue mutations never raise a floating toast; the
	 * last outcome sits above the composer until the next change, with an
	 * optional undo affordance.
	 */
	type WriteStatus = {
		tone: 'error' | 'success' | 'info';
		message: string;
		undo?: () => void;
	};
	let writeStatus = $state<WriteStatus | null>(null);

	function setWriteError(message: string) {
		writeStatus = { tone: 'error', message };
	}

	function setWriteSuccess(message: string, undo?: () => void) {
		writeStatus = { tone: 'success', message, undo };
	}

	onDestroy(() => clearTimeout(copyTimeout));

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

	/** Manual delay dialog (SPEC §2, §5). */
	let delayDialogOpen = $state(false);

	// `detail` is the raw fetched payload; `issue` reflects pending overlays so
	// optimistic edits show instantly and reconcile on the next SSE refresh.
	const issue = $derived(projectDetail(detail)?.issue ?? null);
	const titleDirty = $derived(issue !== null && title.trim() !== issue.title);
	const bodyDirty = $derived(detail !== null && body !== renderedBody);
	/** The structured `blocked` state parsed from the body metadata. */
	const blockedState = $derived(readBlocked(detail?.body ?? ''));
	/** The blocker state from the flag or the metadata, whichever says blocked. */
	const blockerActive = $derived(Boolean(issue?.blocked) || blockedState.isBlocked);
	// A just-saved body is not in the mirror yet, so its HTML is stale; fall
	// back to plain text until the SSE refresh delivers a fresh render.
	const bodyHtml = $derived(
		detail !== null && splitFunnelMetadata(detail.body).content === renderedBody
			? detail.bodyHtml
			: null
	);

	/** Done is the closed state; the picker surfaces it beside the open statuses. */
	const closed = $derived(issue?.state === 'closed');
	const statusOptions = [
		...STATUS_OPTIONS,
		{ value: 'done', label: 'Done', color: 'var(--syntax-constant)' }
	];
	const statusValue = $derived(closed ? 'done' : (issue?.status ?? null));
	const priorityValue = $derived(issue?.priority ?? null);
	const impactValue = $derived(issue?.impact ?? null);
	const urgencyValue = $derived(issue?.urgency ?? null);
	const sizeValue = $derived(issue?.size ?? null);
	const milestoneValue = $derived(issue?.milestone ?? null);
	const milestoneOptions = $derived(detail?.milestoneOptions ?? []);

	/** Plain-text tokens rendered by the metadata table. */
	const severityDisplay = $derived(severityWord(impactValue));
	const sizeDisplay = $derived(
		SIZE_OPTIONS.find((option) => option.value === sizeValue)?.label ?? '—'
	);

	const assigneeLogins = $derived(issue?.assignees.map((a) => a.login) ?? []);
	const assigneeDisplay = $derived(assigneeLogins.join(', '));
	const assigneeOptions = $derived(detail?.assigneeOptions ?? []);
	const selectedLabels = $derived(
		(issue?.labels ?? []).filter(
			(name) => !canonicalLabel(name) && !isRetiredPriorityLabel(name)
		)
	);
	const labelOptions = $derived(
		(detail?.repoLabels ?? [])
			.filter(
				(label) =>
					!canonicalLabel(label.name) && !isRetiredPriorityLabel(label.name)
			)
			.map((label) => ({ value: label.name, label: label.name, color: label.color }))
	);

	const githubLink = $derived(`${githubUrl}/${repo}/issues/${number}`);
	/** Only show the composer once the issue has loaded. */
	const canEdit = $derived(issue !== null && detail !== null);

	/** Shared geometry for the values in the header triage strip. */
	const triageControlClass =
		'inline-flex h-(--size-control-md) max-w-full min-w-0 items-center gap-1.5 rounded-sm px-3 text-left text-body text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:text-fg-disabled';
	const triageValueClass =
		'inline-flex min-h-(--size-control-md) max-w-full min-w-0 items-center gap-1.5 px-3 text-body text-fg';

	/** Label for the mobile back link; the Issues route says “← Issues”. */
	const backLabel = $derived.by(() => {
		const view = viewOf(page.url.pathname);
		const names: Record<string, string> = {
			issues: 'Issues',
			board: 'Board',
			matrix: 'Matrix',
			inbox: 'Inbox'
		};
		return `← ${view ? names[view] : 'Issues'}`;
	});
	const backHref = $derived(`/${viewOf(page.url.pathname) ?? 'issues'}`);

	/** Guards against an out-of-order fetch clobbering a newer one. */
	let loadSeq = 0;

	async function load() {
		const seq = ++loadSeq;
		loading = true;
		error = null;
		// The limit is read untracked: growing it is an explicit reload, not a
		// reason for the refresh effect to fire.
		const result = await fetchIssueDetail(repo, number, untrack(() => commentLimit));
		if (seq !== loadSeq) return;
		if (result.ok) {
			// Reconcile against the raw fetch, then bake any still-pending overlay
			// into `detail` so a later page-side reconcile cannot expose stale
			// fields here. A fetch that predates the mirror catching up is masked.
			reconcileIssues([result.value.issue]);
			const projected = projectDetail(result.value) ?? result.value;
			detail = projected;
			watching = projected.watching;
			title = projected.issue.title;
			const split = splitFunnelMetadata(projected.body);
			body = split.content;
			renderedBody = split.content;
			metadataBlock = split.block;
			editingBody = false;
			editingTitle = false;
		} else {
			detail = null;
			error = result.error;
		}
		loading = false;
	}

	/** The pane's scroll container (DetailShell's body), or the page scroller. */
	function paneScroller(): HTMLElement | null {
		return (
			paneEl?.querySelector<HTMLElement>('.overflow-y-auto') ??
			(document.scrollingElement as HTMLElement | null)
		);
	}

	/**
	 * Widen the comment window by one step and reload. Older comments are
	 * prepended, so the scroll offset grows by the inserted height to keep the
	 * reader on the comment they were looking at.
	 */
	async function loadEarlierComments() {
		if (!detail?.hasMoreComments || loading) return;
		if (commentLimit >= MAX_COMMENT_LIMIT) return;
		const target = `${repo}#${number}`;
		const scroller = paneScroller();
		const beforeTop = scroller?.scrollTop ?? 0;
		const beforeHeight = scroller?.scrollHeight ?? 0;
		commentLimit = Math.min(commentLimit + COMMENT_LIMIT_STEP, MAX_COMMENT_LIMIT);
		await load();
		if (`${repo}#${number}` !== target) return;
		await tick();
		// Let the browser lay out the newly inserted comments first.
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		if (!scroller) return;
		scroller.scrollTop = beforeTop + (scroller.scrollHeight - beforeHeight);
	}

	// Refetch when the selection changes or the server reports a change.
	// A signal scoped to another issue is ignored, and events that land while
	// the title or description is being edited never discard the draft: the
	// signal is remembered and replayed once editing ends.
	let loadedKey = '';
	let loadedSeq = -1;
	/** A change arrived while an editor was open; reload when it closes. */
	let pendingReload = $state(false);

	/** Whether a signal may have touched the issue currently open. */
	function signalTouchesIssue(signal: RefreshPayload): boolean {
		if (signal.repo === undefined) return true;
		if (signal.repo !== repo) return false;
		// An empty list means the whole repo changed, e.g. a new milestone.
		if (signal.numbers === undefined || signal.numbers.length === 0) return true;
		return signal.numbers.includes(number);
	}

	$effect(() => {
		const key = `${repo}#${number}`;
		const signal = $refreshSignal;

		if (key !== loadedKey) {
			loadedKey = key;
			loadedSeq = signal.seq;
			pendingReload = false;
			commentLimit = DEFAULT_COMMENT_LIMIT;
			writeStatus = null;
			void load();
			return;
		}
		if (signal.seq === loadedSeq) return;
		if (!signalTouchesIssue(signal)) return;
		// Reading the edit flags untracked keeps this effect from rerunning (and
		// reloading) on every edit; the effect below replays a remembered signal
		// when the editor closes.
		if (untrack(() => editingBody || editingTitle)) {
			pendingReload = true;
			return;
		}

		loadedSeq = signal.seq;
		void load();
	});

	// A refresh skipped while editing is not dropped: reload as soon as the
	// draft is saved or cancelled.
	$effect(() => {
		const editing = editingBody || editingTitle;
		if (editing || !pendingReload) return;
		pendingReload = false;
		loadedSeq = untrack(() => $refreshSignal.seq);
		void load();
	});

	/** Fold a just-confirmed patch into the local detail (see `load`). */
	function bake(patch: IssuePatch): void {
		if (detail) detail = { ...detail, issue: { ...detail.issue, ...patch } };
	}

	function localAssignee(login: string): UserRef {
		return (
			assigneeOptions.find((u) => u.login === login) ?? {
				externalId: '',
				forge: '',
				instance: '',
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
		writeStatus = null;
		busy = op;
		const issuePatch = toIssuePatch(patch);
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: issuePatch,
			failure: 'Could not update issue',
			notify: false,
			commit: () => updateIssue(repo, number, patch)
		});
		busy = null;
		if (!outcome.ok) {
			setWriteError(outcome.error);
			return false;
		}
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

	/**
	 * A click that did not select text. The title and the description open
	 * their editor on such a click only, so dragging to select prose — which
	 * is how the thread gets copied — never flips the pane into edit mode.
	 */
	function isPlainClick(): boolean {
		return window.getSelection()?.isCollapsed ?? true;
	}

	/** A metadata field whose picker is mounted invisibly behind its value. */
	type MetaPicker = 'status' | 'priority' | 'size' | 'milestone' | 'assignee' | 'labels';

	/**
	 * Open the picker anchored to a metadata value. The pickers stay mounted so
	 * their popovers and mutations are unchanged; the plain-text value is just
	 * the visible trigger.
	 */
	function openPicker(field: MetaPicker) {
		const trigger = paneEl?.querySelector<HTMLElement>(
			`[data-picker="${field}"] [data-slot="popover-trigger"], [data-picker="${field}"] [data-slot="select-trigger"]`
		);
		if (!trigger) return;
		if (trigger.dataset.slot === 'select-trigger') {
			// bits-ui's Select opens on pointerdown rather than click.
			trigger.dispatchEvent(
				new PointerEvent('pointerdown', {
					bubbles: true,
					cancelable: true,
					button: 0,
					pointerType: 'mouse'
				})
			);
			return;
		}
		trigger.click();
	}

	function startTitleEdit() {
		if (!mayWrite || !issue) return;
		title = issue.title;
		editingTitle = true;
	}

	/** Escape abandons an in-progress title edit; nothing is written. */
	function cancelTitleEdit() {
		title = issue?.title ?? '';
		editingTitle = false;
	}

	async function saveTitle() {
		if (!editingTitle || busy) return;
		if (!titleDirty) {
			editingTitle = false;
			return;
		}
		const ok = await runPatch({ title: title.trim() }, 'title');
		if (ok) editingTitle = false;
	}

	/**
	 * Whether the caret or focus already lives in this pane. Clicking prose
	 * puts a collapsed caret in its text node while focus stays on `<body>`,
	 * so both are checked before Mod+A is re-scoped.
	 */
	function paneHasFocusOrCaret(): boolean {
		if (!paneEl) return false;
		const active = document.activeElement;
		if (active && paneEl.contains(active)) return true;
		const anchor = window.getSelection()?.anchorNode ?? null;
		return anchor !== null && paneEl.contains(anchor);
	}

	/**
	 * Select the thread — title through the last comment — instead of letting
	 * the browser select the whole page. Focus inside a field (title editor,
	 * description editor, composer) keeps its native select-all.
	 */
	function onWindowKeydown(event: KeyboardEvent) {
		if (!shouldScopeSelectAll(event)) return;
		if (!titleEl || !activityEl || !paneHasFocusOrCaret()) return;
		event.preventDefault();
		const range = document.createRange();
		range.setStartBefore(titleEl);
		// Ends at the Activity section, so work notes, attachments and the
		// composer stay out of the selection.
		range.setEndAfter(activityEl);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	/** Copy the whole thread as Markdown, metadata and work notes excluded. */
	async function copyThread() {
		if (!issue) return;
		const markdown = issueThreadMarkdown({
			url: githubLink,
			issue,
			body: renderedBody,
			comments: detail?.comments ?? []
		});
		try {
			await navigator.clipboard.writeText(markdown);
		} catch {
			setWriteError('Could not copy the issue. Clipboard access was denied.');
			return;
		}
		copied = true;
		clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => (copied = false), 2000);
	}

	/**
	 * Focus the footer composer from a comment's reply link. `Composer` owns the
	 * textarea and exposes no ref, so reach it by its intended id first and fall
	 * back to the group control inside this pane.
	 */
	function focusComposer() {
		const byId = document.getElementById('issue-composer');
		const field =
			byId instanceof HTMLTextAreaElement
				? byId
				: paneEl?.querySelector<HTMLTextAreaElement>(
						'[data-slot="input-group-control"]'
					) ?? null;
		if (!field) return;
		field.focus();
		const end = field.value.length;
		field.setSelectionRange(end, end);
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
			setWriteSuccess('Triaged · moved to Issues', () => void runPatch({ status: null }, 'status'));
		}
	}

	/**
	 * Write the impact/urgency labels (the axes' GitHub home) and apply the
	 * derived priority optimistically. The mirror re-derives on refresh, so the
	 * overlay reconciles against authoritative data.
	 */
	async function setPriorityLabels(patch: {
		impact?: string | null;
		urgency?: string | null;
	}): Promise<boolean> {
		if (!detail) return false;
		const nextImpact =
			patch.impact === undefined ? impactValue : parseImpactLabel(patch.impact);
		const nextUrgency =
			patch.urgency === undefined ? urgencyValue : parseUrgencyLabel(patch.urgency);
		const derived = derivePriorityOrNull(nextImpact, nextUrgency);
		const issuePatch: IssuePatch = {
			impact: nextImpact,
			urgency: nextUrgency,
			priority: derived
		};
		writeStatus = null;
		busy = 'priority';
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: issuePatch,
			failure: 'Could not update priority',
			notify: false,
			commit: () => updateIssue(repo, number, patch)
		});
		busy = null;
		if (!outcome.ok) {
			setWriteError(outcome.error);
			return false;
		}
		bake(issuePatch);
		return true;
	}

	function commitPriorityAxis(
		axis: 'impact' | 'urgency',
		value: number | null
	): Promise<boolean> {
		return axis === 'impact'
			? setPriorityLabels({ impact: impactLabel(value) })
			: setPriorityLabels({ urgency: urgencyLabel(value) });
	}

	function clearPriority(): Promise<boolean> {
		if (impactValue === null && urgencyValue === null) return Promise.resolve(true);
		return setPriorityLabels({ impact: null, urgency: null });
	}

	async function setSize(value: string | null) {
		await runPatch({ size: value }, 'size');
	}

	/**
	 * Set or clear the issue's milestone. Milestones are repo-scoped, so the
	 * picker (and the "New milestone…" form) only ever targets this issue's repo.
	 */
	async function setMilestone(milestone: RepoMilestoneRef | null) {
		if (!detail) return;
		const issuePatch: IssuePatch = { milestone };
		writeStatus = null;
		busy = 'milestone';
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: issuePatch,
			failure: 'Could not update milestone',
			notify: false,
			commit: () => updateIssue(repo, number, { milestone: milestone ? milestone.number : null })
		});
		busy = null;
		if (!outcome.ok) {
			setWriteError(outcome.error);
			return;
		}
		if (outcome.ok) {
			bake(issuePatch);
			// Re-read the detail so a freshly created milestone joins the options.
			await load();
		}
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

	/**
	 * Watch/unwatch this issue. Watching is personal (not an issue field), so it
	 * bypasses the optimistic overlay and refetches nothing: the next SSE refresh
	 * re-reads the same server-computed flag.
	 */
	async function toggleWatch() {
		if (watchBusy) return;
		const next = !watching;
		writeStatus = null;
		watchBusy = true;
		const result = await setIssueWatching(repo, number, next);
		watchBusy = false;
		if (!result.ok) {
			setWriteError(result.error);
			return;
		}
		watching = result.value?.watching ?? next;
	}

	async function setLabels(next: string[]) {
		if (!detail) return;
		const current = new Set(selectedLabels);
		const target = new Set(next);
		const added = next.filter((name) => !current.has(name));
		const removed = [...selectedLabels].filter((name) => !target.has(name));
		if (added.length === 0 && removed.length === 0) return;

		const reserved = detail.issue.labels.filter(
			(name) => canonicalLabel(name) || isRetiredPriorityLabel(name)
		);
		const issuePatch: IssuePatch = { labels: [...reserved, ...next] };
		writeStatus = null;
		busy = 'labels';
		const outcome = await mutate({
			key: overlayKey(repo, number),
			patch: issuePatch,
			failure: 'Could not update labels',
			notify: false,
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
		if (!outcome.ok) {
			setWriteError(outcome.error);
			return;
		}
		bake(issuePatch);
	}

	async function submitComment() {
		const text = comment.trim();
		if (!text || busy) return;
		writeStatus = null;
		busy = 'comment';
		const result = await addIssueComment(repo, number, text);
		busy = null;
		if (!result.ok) {
			setWriteError(`Could not post the comment. ${result.error}`);
			return;
		}
		comment = '';
		// The mirror updates in the background; refetch to show the new comment.
		await load();
		setWriteSuccess('Comment posted.');
	}

	/** Create an internal work note from the shared composer draft. */
	async function submitWorkNote() {
		const text = comment.trim();
		if (!text || noteBusy) return;
		writeStatus = null;
		noteBusy = 'note:new';
		const result = await addWorkNote(repo, number, text);
		noteBusy = null;
		if (!result.ok) {
			setWriteError(`Could not add the work note. ${result.error}`);
			return;
		}
		comment = '';
		await load();
		setWriteSuccess('Work note added.');
	}

	function submitComposer() {
		if (composerMode === 'note') void submitWorkNote();
		else void submitComment();
	}

	async function editWorkNote(id: string, text: string) {
		writeStatus = null;
		noteBusy = `note:${id}`;
		const result = await updateWorkNote(repo, number, id, text);
		noteBusy = null;
		if (!result.ok) {
			setWriteError(`Could not update the work note. ${result.error}`);
			return;
		}
		await load();
		setWriteSuccess('Work note updated.');
	}

	async function removeWorkNote(id: string) {
		writeStatus = null;
		noteBusy = `note:${id}`;
		const result = await deleteWorkNote(repo, number, id);
		noteBusy = null;
		if (!result.ok) {
			setWriteError(`Could not delete the work note. ${result.error}`);
			return;
		}
		await load();
		setWriteSuccess('Work note deleted.');
	}

	async function publishNote(id: string) {
		writeStatus = null;
		noteBusy = `note:${id}`;
		const result = await publishWorkNote(repo, number, id);
		noteBusy = null;
		if (!result.ok) {
			setWriteError(`Could not publish the work note. ${result.error}`);
			return;
		}
		await load();
		setWriteSuccess('Work note published as a comment.');
	}

	async function uploadFiles(files: File[]) {
		if (files.length === 0) return;
		writeStatus = null;
		uploading += files.length;
		let changed = false;
		for (const file of files) {
			const result = await uploadAttachment(repo, number, file);
			if (result.ok) changed = true;
			else setWriteError(`Could not upload ${file.name}. ${result.error}`);
		}
		uploading -= files.length;
		if (changed) await load();
	}

	async function removeAttachment(item: AttachmentItem) {
		if (deletingId) return;
		writeStatus = null;
		deletingId = item.id;
		const result = await deleteAttachment(item.id);
		deletingId = null;
		if (!result.ok) {
			setWriteError(`Could not delete the attachment. ${result.error}`);
			return;
		}
		await load();
	}
</script>

{#snippet undoAction()}
	<Button variant="ghost" size="xs" onclick={() => writeStatus?.undo?.()}>Undo</Button>
{/snippet}

{#snippet retryLoad()}
	<Button variant="ghost" size="xs" onclick={() => void load()}>Retry</Button>
{/snippet}

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

<DetailShell
	bind:element={paneEl}
	ariaLabel="Issue inspector"
	class={cn('min-w-0 flex-1', !fill && 'border-l border-border-subtle')}
	contentKey={`${repo}#${number}:${detail?.bodyHtml ?? ''}:${detail?.comments.length ?? 0}:${detail?.workNotes.length ?? 0}`}
	footer={canEdit && mayWrite ? composer : undefined}
>
	{#snippet header()}
		<div class="flex min-w-0 flex-1 flex-col gap-1.5">
			<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-secondary">
				<a href={backHref} class="link lg:hidden">{backLabel}</a>
				<RefText value={`${repo}#${number}`} />
				<Button
					variant="ghost"
					size="xs"
					href={githubLink}
					target="_blank"
					rel="noreferrer"
					class="text-fg-secondary hover:text-fg"
					title="Open on GitHub"
				>
					<ExternalLinkIcon class="size-3.5" aria-hidden="true" />
					GitHub
				</Button>
				<Button
					variant="ghost"
					size="xs"
					class="text-fg-secondary hover:text-fg"
					title={copied ? 'Copied' : 'Copy issue as Markdown'}
					onclick={() => void copyThread()}
				>
					{#if copied}
						<CheckIcon class="size-3.5" aria-hidden="true" />
						Copied
					{:else}
						<CopyIcon class="size-3.5" aria-hidden="true" />
						Copy
					{/if}
				</Button>
			</div>

			{#if issue}
				<div class="flex min-w-0 items-center gap-2">
					{#if editingTitle}
						<Input
							class="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 text-heading-md font-semibold leading-heading-md tracking-[-0.01em] shadow-none"
							value={title}
							oninput={(e) => (title = e.currentTarget.value)}
							onblur={saveTitle}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									e.currentTarget.blur();
								} else if (e.key === 'Escape') {
									e.preventDefault();
									cancelTitleEdit();
								}
							}}
							aria-label="Issue title"
							disabled={busy === 'title'}
						/>
						{#if busy === 'title'}
							<Spinner size={14} />
						{:else if titleDirty}
							<Button variant="secondary" size="sm" onclick={saveTitle}>Save</Button>
						{/if}
					{:else}
						<!--
							Plain text rather than an input: a rendered input value is not
							part of a text selection, so Mod+A could never include it.
						-->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<h1
							bind:this={titleEl}
							class={cn(
								'min-w-0 flex-1 break-words text-heading-md font-semibold leading-heading-md tracking-[-0.01em] text-fg',
								mayWrite && '-ml-1 cursor-text rounded-sm px-1 hover:bg-surface-2'
							)}
							tabindex={mayWrite ? 0 : undefined}
							role={mayWrite ? 'button' : undefined}
							aria-label={mayWrite ? 'Issue title; activate to edit' : 'Issue title'}
							onclick={() => mayWrite && isPlainClick() && startTitleEdit()}
							onkeydown={(e) => {
								if (mayWrite && (e.key === 'Enter' || e.key === ' ')) {
									e.preventDefault();
									startTitleEdit();
								}
							}}
						>
							{title}
						</h1>
					{/if}
				</div>

				<!-- Triage: the four values a reader or triager changes most often. -->
				<section
					class="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1"
					aria-label="Issue triage"
				>
					<div class="relative min-w-0">
						{#if mayWrite}
							<button
								type="button"
								class={triageControlClass}
								disabled={busy === 'status'}
								title="Change status"
								onclick={() => openPicker('status')}
							>
								<StatusText status={issue.status} state={issue.state} />
							</button>
							<div
								class="pointer-events-none invisible absolute top-0 left-0"
								data-picker="status"
							>
								<SingleSelect
									label="No status"
									options={statusOptions}
									value={statusValue}
									onselect={setStatus}
									disabled={busy === 'status'}
								/>
							</div>
						{:else}
							<span class={triageValueClass}>
								<StatusText status={issue.status} state={issue.state} />
							</span>
						{/if}
					</div>

					<div class="relative min-w-0">
						{#if mayWrite}
							<button
								type="button"
								class={triageControlClass}
								disabled={busy === 'priority'}
								title="Change priority"
								onclick={() => openPicker('priority')}
							>
								{#if priorityValue}
									<PriorityText priority={priorityValue} showName />
								{:else}
									<span class="text-fg-secondary">No priority</span>
								{/if}
							</button>
							<div
								class="pointer-events-none invisible absolute top-0 left-0"
								data-picker="priority"
							>
								<PriorityPicker
									impact={impactValue}
									urgency={urgencyValue}
									priority={priorityValue}
									disabled={busy === 'priority'}
									oncommit={commitPriorityAxis}
									onclear={clearPriority}
								/>
							</div>
						{:else}
							<span class={triageValueClass}>
								{#if priorityValue}
									<PriorityText priority={priorityValue} showName />
								{:else}
									<span class="text-fg-secondary">No priority</span>
								{/if}
							</span>
						{/if}
					</div>

					<div class="relative min-w-0">
						{#if mayWrite}
							<button
								type="button"
								class={triageControlClass}
								disabled={busy === 'assignees'}
								title="Change assignee"
								onclick={() => openPicker('assignee')}
							>
								<UserIcon class="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
								<span class="truncate">{assigneeDisplay || 'Unassigned'}</span>
							</button>
							<div
								class="pointer-events-none invisible absolute top-0 left-0"
								data-picker="assignee"
							>
								<MultiSelect
									hideCount
									label="Assignee"
									placeholder="Unassigned"
									display="selection"
									options={assigneeOptions.map((u) => ({ value: u.login, label: u.login }))}
									selected={assigneeLogins}
									onselect={setAssignees}
									disabled={busy === 'assignees'}
								/>
							</div>
						{:else}
							<span class={triageValueClass}>
								<UserIcon class="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
								<span class="truncate">{assigneeDisplay || 'Unassigned'}</span>
							</span>
						{/if}
					</div>

					<div class="relative min-w-0">
						{#if mayWrite}
							<button
								type="button"
								class={triageControlClass}
								disabled={busy === 'milestone'}
								title="Change milestone"
								onclick={() => openPicker('milestone')}
							>
								<MilestoneIcon class="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
								<span class="truncate">{milestoneValue?.title ?? 'No milestone'}</span>
							</button>
							<div
								class="pointer-events-none invisible absolute top-0 left-0"
								data-picker="milestone"
							>
								<MilestonePicker
									{repo}
									value={milestoneValue}
									options={milestoneOptions}
									disabled={busy === 'milestone'}
									onselect={(milestone) => void setMilestone(milestone)}
								/>
							</div>
						{:else}
							<span class={triageValueClass}>
								<MilestoneIcon class="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
								<span class="truncate">{milestoneValue?.title ?? 'No milestone'}</span>
							</span>
						{/if}
					</div>

					<span
						class="ml-auto shrink-0 px-2 text-caption text-fg-secondary"
						title={absoluteTime(issue.updatedAt)}
					>
						Updated {timeAgo(issue.updatedAt)}
					</span>
				</section>

				{#if detail && (detail.epic || issue.isEpic)}
					<EpicProperty
						issue={detail.issue}
						parent={detail.epic}
						{repo}
						{number}
						{mayWrite}
					/>
				{/if}

				{#if writeStatus}
					<div class="pt-1">
						{#if writeStatus.undo}
							<InlineStatus
								tone={writeStatus.tone}
								message={writeStatus.message}
								action={undoAction}
							/>
						{:else}
							<InlineStatus tone={writeStatus.tone} message={writeStatus.message} />
						{/if}
					</div>
				{/if}
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-1 self-start">
			<Button variant="ghost" size="icon-sm" title="Close inspector" onclick={onclose}>
				<XIcon />
			</Button>
		</div>
	{/snippet}

	{#if loading && !detail}
		<div class="flex flex-1 items-center justify-center p-6 text-fg-secondary">
			<Spinner size={16} label="Loading issue" />
		</div>
	{:else if error}
		<div class="flex flex-1 items-start justify-center p-6">
			<InlineStatus tone="error" message={error} action={retryLoad} class="max-w-md" />
		</div>
	{:else if issue && detail}
		{#if issue.labelConflict}
			<InlineStatus
				tone="warning"
				message="GitHub carries a conflicting reserved label or a retired priority label. Funnel uses the derived priority and does not trust the label."
			/>
		{/if}

		{#if blockerActive}
			<section class="flex flex-col gap-2" aria-label="Blocker">
				<div
					class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle pt-3"
				>
					<StatusText blocked />
					{#if blockedState.info?.recheck}
						<span class="text-caption text-fg-secondary">
							Re-check {blockedState.info.recheck}
						</span>
					{/if}
					{#if mayWrite}
						<Button
							variant="ghost"
							size="xs"
							class="ml-auto"
							disabled={busy === 'blocked' || !canEdit}
							onclick={() => openBlockDialog('unblock')}
						>
							Unblock
						</Button>
					{/if}
				</div>
				{#if blockedState.info}
					<dl class="label-value">
						<dt>Reason</dt>
						<dd>{delayReasonLabel(blockedState.info.reason)}</dd>
						<dt>Blocker</dt>
						<dd class="break-words">{blockedState.info.blocker}</dd>
						{#if blockedState.info.needs}
							<dt>Needs to unblock</dt>
							<dd class="break-words">{blockedState.info.needs}</dd>
						{/if}
						{#if blockedState.info.trying}
							<dt>Currently trying</dt>
							<dd class="break-words">{blockedState.info.trying}</dd>
						{/if}
					</dl>
				{/if}
			</section>
		{/if}

		<section class="flex max-w-[var(--layout-measure)] flex-col" aria-label="Description">
			{#if editingBody}
				<Textarea
					class="min-h-32 text-body-content leading-body-content"
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
						'min-h-12 py-1 text-body-content leading-body-content text-fg',
						mayWrite && 'cursor-text rounded-sm hover:bg-surface-2',
						bodyHtml !== null && 'markdown',
						bodyHtml === null && 'plain-text'
					)}
					role={mayWrite ? 'button' : undefined}
					tabindex={mayWrite ? 0 : undefined}
					aria-label={mayWrite ? 'Issue description; activate to edit' : 'Issue description'}
					onclick={() => mayWrite && isPlainClick() && (editingBody = true)}
					onkeydown={(e) => {
						if (mayWrite && (e.key === 'Enter' || e.key === ' ')) {
							e.preventDefault();
							editingBody = true;
						}
					}}
				>
					{#if body.trim().length === 0}
						<span class="text-fg-muted">Add a description…</span>
					{:else if bodyHtml !== null}
						{@html bodyHtml}
					{:else}
						{body}
					{/if}
				</div>
			{/if}
		</section>

		<section
			bind:this={activityEl}
			class="flex max-w-[var(--layout-measure)] flex-col gap-2"
			aria-label="Activity"
		>
			<div class="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-3">
				<h2 class="text-heading-sm font-semibold text-fg">Activity</h2>
				<span class="text-caption tabular-nums text-fg-secondary">{detail.commentTotal}</span>
			</div>
			{#if detail.hasMoreComments && commentLimit < MAX_COMMENT_LIMIT}
				<div class="flex justify-center">
					<Button
						variant="ghost"
						size="xs"
						disabled={loading}
						onclick={() => void loadEarlierComments()}
					>
						Load earlier comments
					</Button>
				</div>
			{/if}
			{#if detail.comments.length === 0}
				<p class="text-body text-fg-secondary">No comments yet.</p>
			{:else}
				<ActivityTimeline
					comments={detail.comments}
					workNotes={[]}
					filter="comments"
					bubbles={commentBubbles}
					reporterLogin={detail.issue.author?.login ?? null}
					readonly={!mayWrite}
					onreply={mayWrite ? () => focusComposer() : undefined}
					onedit={editWorkNote}
					ondelete={removeWorkNote}
					onpublish={publishNote}
				/>
			{/if}
		</section>

		{#if workNotesEnabled}
			<section
				class="flex max-w-[var(--layout-measure)] flex-col gap-2"
				aria-label="Work notes"
			>
				<div class="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-3">
					<h2 class="text-heading-sm font-semibold text-fg">Work notes</h2>
					<span class="text-caption tabular-nums text-fg-secondary">
						{detail.workNotes.length}
					</span>
				</div>
				{#if detail.workNotes.length === 0}
					<p class="text-body text-fg-secondary">
						No work notes yet. Internal notes stay in Funnel unless you publish them.
					</p>
				{:else}
					<ActivityTimeline
						comments={[]}
						workNotes={detail.workNotes}
						filter="notes"
						viewerLogin={viewerLogin}
						reporterLogin={detail.issue.author?.login ?? null}
						readonly={!mayWrite}
						busyId={noteBusy}
						onreply={mayWrite ? () => focusComposer() : undefined}
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

		<details class="group border-t border-border-subtle">
			<summary
				class="flex min-h-(--size-control-md) cursor-pointer list-none items-center gap-2 py-2 text-body font-semibold text-fg marker:content-none [&::-webkit-details-marker]:hidden"
			>
				<ChevronRightIcon
					class="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-90"
					aria-hidden="true"
				/>
				Details
				<span class="text-caption font-normal text-fg-secondary">
					Severity, labels, people, time
				</span>
			</summary>

			<div class="flex flex-col gap-4 pb-1">
				<dl class="label-value">
					<dt>Severity</dt>
					<dd>{severityDisplay}</dd>

					<dt>Size</dt>
					<dd>
						<div class="relative min-w-0 flex-1">
							{#if mayWrite}
								<button
									type="button"
									class="text-left text-body text-fg hover:text-primary disabled:pointer-events-none disabled:text-fg-disabled"
									disabled={busy === 'size'}
									title="Change size"
									onclick={() => openPicker('size')}
								>
									{sizeDisplay}
								</button>
								<div
									class="pointer-events-none invisible absolute top-0 left-0"
									data-picker="size"
								>
									<SingleSelect
										label="No size"
										options={SIZE_OPTIONS}
										value={sizeValue}
										onselect={setSize}
										allowClear
										disabled={busy === 'size'}
									/>
								</div>
							{:else}
								<span>{sizeDisplay}</span>
							{/if}
						</div>
					</dd>

					<dt>Reporter</dt>
					<dd class="break-words">{issue.author?.login ?? '—'}</dd>

					<dt>Labels</dt>
					<dd>
						<div class="relative min-w-0 flex-1">
							{#if mayWrite}
								<button
									type="button"
									class="text-left text-body hover:text-primary disabled:pointer-events-none disabled:text-fg-disabled"
									disabled={busy === 'labels'}
									title="Change labels"
									onclick={() => openPicker('labels')}
								>
									{#if selectedLabels.length === 0}
										<span class="text-fg-secondary">—</span>
									{:else}
										<span class="break-words text-fg">{selectedLabels.join(', ')}</span>
									{/if}
								</button>
								<div
									class="pointer-events-none invisible absolute top-0 left-0"
									data-picker="labels"
								>
									<MultiSelect
										hideCount
										label="Labels"
										placeholder="No labels"
										display="selection"
										options={labelOptions}
										selected={selectedLabels}
										onselect={setLabels}
										disabled={busy === 'labels'}
									/>
								</div>
							{:else}
								<span class="break-words text-fg-secondary">
									{selectedLabels.length === 0 ? '—' : selectedLabels.join(', ')}
								</span>
							{/if}
						</div>
					</dd>

					{#if !blockerActive}
						<dt>Blocked</dt>
						<dd>
							{#if mayWrite}
								<button
									type="button"
									class="text-left text-body text-fg hover:text-primary disabled:pointer-events-none disabled:text-fg-disabled"
									disabled={busy === 'blocked' || !canEdit}
									title="Block issue"
									onclick={() => openBlockDialog('block')}
								>
									Block issue
								</button>
							{:else}
								<span>Not blocked</span>
							{/if}
						</dd>
					{/if}

					<dt>Watching</dt>
					<dd>
						{#if mayWrite}
							<button
								type="button"
								class="inline-flex items-center gap-1.5 text-left text-body text-fg hover:text-primary disabled:pointer-events-none disabled:text-fg-disabled"
								disabled={watchBusy || !canEdit}
								aria-pressed={watching}
								onclick={() => void toggleWatch()}
							>
								{#if watchBusy}
									<Spinner size={12} />
								{:else}
									{watching ? 'Watching' : 'Not watching'}
								{/if}
							</button>
						{:else}
							<span>{watching ? 'Watching' : 'Not watching'}</span>
						{/if}
					</dd>

					{#if !detail.epic && !detail.issue.isEpic}
						<dt>Epic</dt>
						<dd>
							<EpicProperty
								issue={detail.issue}
								parent={detail.epic}
								{repo}
								{number}
								{mayWrite}
							/>
						</dd>
					{/if}
				</dl>

				<IssueTimeCard time={detail.time} />

				<DelayList
					delays={detail.delays}
					{repo}
					{number}
					mayWrite={mayWrite}
					onrecord={() => (delayDialogOpen = true)}
				/>
			</div>
		</details>
	{/if}
</DetailShell>

<svelte:window onkeydown={onWindowKeydown} />
<!-- Announced to screen readers; kept outside the pane so a Mod+A transcript never picks it up. -->
<span aria-live="polite" class="sr-only">{copied ? 'Issue copied' : ''}</span>

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

<RecordDelayDialog
	open={delayDialogOpen}
	{repo}
	{number}
	onopenchange={(open) => (delayDialogOpen = open)}
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
