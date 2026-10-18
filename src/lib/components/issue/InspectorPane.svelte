<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import * as Alert from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import { Textarea } from '#lib/components/ui/textarea';
	import {
		addIssueComment,
		addIssueLabels,
		closeIssue,
		fetchIssueDetail,
		removeIssueLabel,
		reopenIssue,
		updateIssue,
		type CloseReason,
		type UpdateIssuePatch
	} from '#lib/client/mutations';
	import { refreshSignal } from '#lib/client/refresh';
	import {
		PRIORITY_OPTIONS,
		SIZE_OPTIONS,
		STATUS_OPTIONS,
		canonicalLabel
	} from '#lib/labels';
	import { absoluteTime, relativeTime } from '#lib/time';
	import type { RenderedIssueDetail, UserRef } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
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
	}

	let { repo, number, githubUrl, onclose, fill = false }: Props = $props();

	let detail = $state<RenderedIssueDetail | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let actionError = $state<string | null>(null);

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

	const issue = $derived(detail?.issue ?? null);
	const titleDirty = $derived(issue !== null && title.trim() !== issue.title);
	const bodyDirty = $derived(detail !== null && body !== detail.body);
	// A just-saved body is not in the mirror yet, so its HTML is stale; fall
	// back to plain text until the SSE refresh delivers a fresh render.
	const bodyHtml = $derived(
		detail !== null && detail.body === renderedBody ? detail.bodyHtml : null
	);

	/** Done is the closed state; the pill surfaces it beside the open statuses. */
	const closed = $derived(issue?.state === 'closed');
	const statusOptions = [
		...STATUS_OPTIONS,
		{ value: 'done', label: 'Done', color: 'be95ff' }
	];
	const statusValue = $derived(closed ? 'done' : (issue?.status ?? null));
	const priorityValue = $derived(issue?.priority ?? null);
	const sizeValue = $derived(issue?.size ?? null);

	/** Done has no canonical label, so tint its pill explicitly. */
	const statusTint = $derived(closed ? 'color: #be95ff' : tintStyle(issue?.status ?? null));

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

	/** Inline `color:` tint for a canonical label value, or undefined. */
	function tintStyle(name: string | null | undefined): string | undefined {
		const color = name ? canonicalLabel(name)?.color : null;
		if (!color) return undefined;
		const hex = /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color;
		return `color: ${hex}`;
	}

	async function load() {
		loading = true;
		error = null;
		const result = await fetchIssueDetail(repo, number);
		if (result.ok) {
			detail = result.value;
			title = result.value.issue.title;
			body = result.value.body;
			renderedBody = result.value.body;
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

	async function runPatch(patch: UpdateIssuePatch, op: string): Promise<boolean> {
		if (!detail) return false;
		busy = op;
		actionError = null;
		const result = await updateIssue(repo, number, patch);
		busy = null;
		if (!result.ok) {
			actionError = result.error;
			return false;
		}
		// Pessimistic: reflect the confirmed change locally; SSE reconciles.
		const issue = detail.issue;
		detail = {
			...detail,
			body: patch.body ?? detail.body,
			issue: {
				...issue,
				title: patch.title ?? issue.title,
				status: 'status' in patch ? (patch.status ?? null) : issue.status,
				priority: 'priority' in patch ? (patch.priority ?? null) : issue.priority,
				size: 'size' in patch ? (patch.size ?? null) : issue.size,
				assignees: patch.assignees
					? localAssigneeList(patch.assignees)
					: issue.assignees,
				state: patch.state ?? issue.state,
				stateReason:
					'state_reason' in patch ? (patch.state_reason ?? null) : issue.stateReason,
				closedAt:
					patch.state === 'closed'
						? Date.now()
						: patch.state === 'open'
							? null
							: issue.closedAt
			}
		};
		if (patch.body !== undefined) body = patch.body;
		return true;
	}

	function openDialog(mode: 'close' | 'reopen', status: string | null = null) {
		resolveError = null;
		pendingStatus = status;
		dialogMode = mode;
	}

	/** Close with a required resolution: note comment first, then the state change. */
	async function confirmClose(payload: { reason: CloseReason; note: string }) {
		if (!detail) return;
		busy = 'close';
		resolveError = null;
		const result = await closeIssue(repo, number, payload.reason, payload.note);
		busy = null;
		if (!result.ok) {
			resolveError = result.error;
			return;
		}
		detail = {
			...detail,
			issue: {
				...detail.issue,
				state: 'closed',
				stateReason: payload.reason,
				closedAt: Date.now()
			}
		};
		dialogMode = null;
	}

	/** Reopen with a required note, posted as a comment before the state change. */
	async function confirmReopen(payload: { reason: CloseReason; note: string }) {
		if (!detail) return;
		busy = 'reopen';
		resolveError = null;
		const result = await reopenIssue(
			repo,
			number,
			payload.note,
			pendingStatus ?? undefined
		);
		busy = null;
		if (!result.ok) {
			resolveError = result.error;
			return;
		}
		detail = {
			...detail,
			issue: {
				...detail.issue,
				state: 'open',
				stateReason: null,
				closedAt: null,
				status: pendingStatus ?? detail.issue.status
			}
		};
		pendingStatus = null;
		dialogMode = null;
	}

	async function saveTitle() {
		if (!titleDirty || busy) return;
		await runPatch({ title: title.trim() }, 'title');
	}

	async function saveBody() {
		if (!bodyDirty || busy) return;
		const ok = await runPatch({ body }, 'body');
		if (ok) editingBody = false;
	}

	function cancelBody() {
		body = detail?.body ?? '';
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
		await runPatch({ status: value }, 'status');
	}

	async function setPriority(value: string | null) {
		await runPatch({ priority: value }, 'priority');
	}

	async function setSize(value: string | null) {
		await runPatch({ size: value }, 'size');
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

		busy = 'labels';
		actionError = null;
		try {
			if (added.length > 0) {
				const result = await addIssueLabels(repo, number, added);
				if (!result.ok) throw new Error(result.error);
			}
			for (const name of removed) {
				const result = await removeIssueLabel(repo, number, name);
				if (!result.ok) throw new Error(result.error);
			}
			const reserved = detail.issue.labels.filter((name) => canonicalLabel(name));
			detail = {
				...detail,
				issue: { ...detail.issue, labels: [...reserved, ...next] }
			};
		} catch (err) {
			actionError = (err as Error).message;
		} finally {
			busy = null;
		}
	}

	async function submitComment() {
		const text = comment.trim();
		if (!text || busy) return;
		busy = 'comment';
		actionError = null;
		const result = await addIssueComment(repo, number, text);
		busy = null;
		if (!result.ok) {
			actionError = result.error;
			return;
		}
		comment = '';
		// The mirror updates in the background; refetch to show the new comment.
		await load();
	}
</script>

<aside
	class={cn(
		'bg-background flex h-full flex-col border-l',
		fill
			? 'min-w-0 flex-1 border-l-0'
			: 'w-120 max-[1100px]:absolute max-[1100px]:inset-y-0 max-[1100px]:right-0 max-[1100px]:z-40 max-[1100px]:w-[min(480px,100%)] max-[1100px]:shadow-lg'
	)}
	aria-label="Issue inspector"
>
	<header class="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
		<div class="flex min-w-0 items-center gap-2">
			<span class="mono text-muted-foreground truncate text-xs" title={repo}>{repo}</span>
			<span class="text-muted-foreground text-xs">/</span>
			<span class="mono text-muted-foreground text-xs">#{number}</span>
			{#if issue}
				<Chip
					label={issue.state === 'closed' ? 'closed' : 'open'}
					color={issue.state === 'closed' ? 'be95ff' : '42be65'}
				/>
				{#if issue.author}
					<span class="text-muted-foreground truncate text-xs">
						opened by <strong class="text-foreground font-medium">{issue.author.login}</strong>
						· <span title={absoluteTime(issue.updatedAt)}>{relativeTime(issue.updatedAt)}</span>
					</span>
				{/if}
			{/if}
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
	</header>

	{#if loading && !detail}
		<div class="text-muted-foreground flex flex-1 items-center justify-center p-6">
			<Spinner size={16} label="Loading issue" />
		</div>
	{:else if error}
		<div class="flex flex-1 items-start justify-center p-6">
			<Alert.Root variant="destructive">
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		</div>
	{:else if issue && detail}
		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
			<div class="flex items-center gap-2">
				<Input
					class="hover:bg-accent/50 focus-visible:border-input h-auto rounded-none border-transparent bg-transparent px-1.5 text-lg font-semibold tracking-tight shadow-none dark:bg-transparent"
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
					disabled={busy === 'title'}
				/>
				{#if busy === 'title'}
					<Spinner size={14} />
				{:else if titleDirty}
					<Button variant="secondary" size="sm" onclick={saveTitle}>Save</Button>
				{/if}
			</div>

			{#if actionError}
				<Alert.Root variant="destructive">
					<Alert.Description>{actionError}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if issue.labelConflict}
				<Alert.Root>
					<Alert.Description>
						Conflicting reserved labels were detected on GitHub; the mirror used the latest
						timeline entry.
					</Alert.Description>
				</Alert.Root>
			{/if}

			<section class="flex flex-wrap items-center gap-1" aria-label="Issue properties">
				<SingleSelect
					variant="ghost"
					label="No status"
					options={statusOptions}
					value={statusValue}
					onselect={setStatus}
					disabled={busy === 'status'}
				>
					{#snippet icon()}
						<CircleDashedIcon size={14} style={statusTint} />
					{/snippet}
				</SingleSelect>

				<SingleSelect
					variant="ghost"
					label="No priority"
					options={PRIORITY_OPTIONS}
					value={priorityValue}
					onselect={setPriority}
					allowClear
					disabled={busy === 'priority'}
				>
					{#snippet icon()}
						<SignalIcon size={14} style={tintStyle(priorityValue)} />
					{/snippet}
				</SingleSelect>

				<SingleSelect
					variant="ghost"
					label="No size"
					options={SIZE_OPTIONS}
					value={sizeValue}
					onselect={setSize}
					allowClear
					disabled={busy === 'size'}
				>
					{#snippet icon()}
						<RulerIcon size={14} style={tintStyle(sizeValue)} />
					{/snippet}
				</SingleSelect>

				<MultiSelect
					variant="ghost"
					hideCount
					label="Assignee"
					placeholder="Unassigned"
					display="selection"
					options={assigneeOptions.map((u) => ({ value: u.login, label: u.login }))}
					selected={assigneeLogins}
					onselect={setAssignees}
					disabled={busy === 'assignees'}
				>
					{#snippet icon()}
						{@const first = assignees[0]}
						{#if first}
							<Avatar login={first.login} avatarUrl={first.avatarUrl} size={16} />
						{:else}
							<CircleUserIcon size={14} />
						{/if}
					{/snippet}
				</MultiSelect>

				<MultiSelect
					variant="ghost"
					hideCount
					label="Labels"
					placeholder="No labels"
					display="selection"
					options={labelOptions}
					selected={selectedLabels}
					onselect={setLabels}
					disabled={busy === 'labels'}
				>
					{#snippet icon()}
						<TagIcon size={14} />
					{/snippet}
				</MultiSelect>
			</section>

			<section class="flex flex-col gap-2">
				{#if busy === 'body' || editingBody}
					<div class="flex items-center justify-end gap-1">
						{#if busy === 'body'}
							<Spinner size={13} />
						{:else}
							<Button variant="ghost" size="xs" onclick={cancelBody}>Cancel</Button>
							<Button variant="secondary" size="xs" onclick={saveBody} disabled={!bodyDirty}>
								Save
							</Button>
						{/if}
					</div>
				{/if}
				{#if editingBody}
					<Textarea
						class="min-h-32"
						value={body}
						oninput={(e) => (body = e.currentTarget.value)}
						onkeydown={onBodyKeydown}
						placeholder="Describe the issue…"
						rows={6}
					></Textarea>
				{:else}
					<div
						class={cn(
							'hover:bg-accent/50 -mx-2 min-h-12 cursor-text px-2 py-1 text-sm leading-relaxed text-foreground transition-colors',
							bodyHtml !== null && 'markdown',
							bodyHtml === null && 'plain-text'
						)}
						role="button"
						tabindex="0"
						aria-label="Issue description; activate to edit"
						onclick={() => (editingBody = true)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
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

			<section class="flex flex-col gap-2">
				<span class="text-muted-foreground text-xs font-semibold">
					Comments ({detail.comments.length})
				</span>
				{#if detail.comments.length === 0}
					<div class="text-muted-foreground text-xs">No comments yet.</div>
				{:else}
					<ul class="flex flex-col gap-3">
						{#each detail.comments as entry (entry.githubId)}
							<li class="flex gap-2">
								<Avatar
									login={entry.author?.login ?? 'ghost'}
									avatarUrl={entry.author?.avatarUrl}
									size={20}
								/>
								<div class="flex min-w-0 flex-1 flex-col gap-0.5">
									<div class="flex items-baseline gap-2 text-xs">
										<strong class="font-medium">{entry.author?.login ?? 'ghost'}</strong>
										<span class="text-muted-foreground" title={absoluteTime(entry.createdAt)}>
											{relativeTime(entry.createdAt)}
										</span>
									</div>
									<div class="markdown text-foreground text-sm">{@html entry.bodyHtml}</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		<section class="flex shrink-0 flex-col gap-2 border-t p-3">
			<Textarea
				class="min-h-16"
				value={comment}
				oninput={(e) => (comment = e.currentTarget.value)}
				placeholder="Add a comment…"
				rows={2}
			></Textarea>
			<div class="flex justify-end">
				<Button
					onclick={submitComment}
					disabled={comment.trim().length === 0 || busy === 'comment'}
				>
					{#if busy === 'comment'}
						<span data-icon="inline-start" class="inline-flex items-center">
							<Spinner size={13} />
						</span>
					{/if}
					Comment
				</Button>
			</div>
		</section>
	{/if}

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
</aside>
