<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
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
	import IconPriority from '~icons/carbon/signal-strength';
	import IconSize from '~icons/carbon/scales';
	import IconStatus from '~icons/carbon/circle-dash';
	import IconTag from '~icons/carbon/tag';
	import IconUser from '~icons/carbon/user-avatar';

	interface Props {
		repo: string;
		number: number;
		githubUrl: string;
		onclose: () => void;
		/** Fill the parent column instead of docking at `--inspector-width`. */
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
	const statusTint = $derived(
		closed ? 'color: #be95ff' : tintStyle(issue?.status ?? null)
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
	class="inspector"
	class:inspector--fill={fill}
	aria-label="Issue inspector"
>
	<header class="inspector__head">
		<div class="crumb">
			<span class="mono crumb__repo" title={repo}>{repo}</span>
			<span class="crumb__sep">/</span>
			<span class="mono crumb__number">#{number}</span>
			{#if issue}
				<Chip
					label={issue.state === 'closed' ? 'closed' : 'open'}
					color={issue.state === 'closed' ? 'be95ff' : '42be65'}
				/>
				{#if issue.author}
					<span class="crumb__meta">
						opened by <strong>{issue.author.login}</strong>
						· <span title={absoluteTime(issue.updatedAt)}>{relativeTime(issue.updatedAt)}</span>
					</span>
				{/if}
			{/if}
		</div>
		<div class="inspector__actions">
			<a class="icon-link" href={githubLink} target="_blank" rel="noreferrer" title="Open on GitHub">
				<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
					<path
						d="M6 3h7v7M13 3L6 10M11 9v4H3V5h4"
						fill="none"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
			<button class="icon-link" type="button" title="Close inspector" onclick={onclose}>
				<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
					<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" />
				</svg>
			</button>
		</div>
	</header>

	{#if loading && !detail}
		<div class="placeholder"><Spinner size={16} label="Loading issue" /></div>
	{:else if error}
		<div class="placeholder placeholder--error">{error}</div>
	{:else if issue && detail}
		<div class="inspector__body">
			<div class="title-edit">
				<input
					class="title-input"
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
					<button class="save-btn" type="button" onclick={saveTitle}>Save</button>
				{/if}
			</div>

			{#if actionError}
				<div class="banner banner--error">{actionError}</div>
			{/if}
			{#if issue.labelConflict}
				<div class="banner banner--warn">
					Conflicting reserved labels were detected on GitHub; the mirror used the
					latest timeline entry.
				</div>
			{/if}

			<section class="meta" aria-label="Issue properties">
				<SingleSelect
					variant="ghost"
					label="No status"
					options={statusOptions}
					value={statusValue}
					onselect={setStatus}
					disabled={busy === 'status'}
				>
					{#snippet icon()}
						<IconStatus width={14} height={14} style={statusTint} />
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
						<IconPriority width={14} height={14} style={tintStyle(priorityValue)} />
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
						<IconSize width={14} height={14} style={tintStyle(sizeValue)} />
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
							<IconUser width={14} height={14} />
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
						<IconTag width={14} height={14} />
					{/snippet}
				</MultiSelect>
			</section>

			<section class="block">
				{#if busy === 'body' || editingBody}
					<div class="block__head">
						<div class="block__tools">
							{#if busy === 'body'}
								<Spinner size={13} />
							{:else}
								<button class="save-btn" type="button" onclick={cancelBody}>Cancel</button>
								<button class="save-btn" type="button" onclick={saveBody} disabled={!bodyDirty}>
									Save
								</button>
							{/if}
						</div>
					</div>
				{/if}
				{#if editingBody}
					<textarea
						class="body-edit"
						value={body}
						oninput={(e) => (body = e.currentTarget.value)}
						onkeydown={onBodyKeydown}
						placeholder="Describe the issue…"
						rows="6"
					></textarea>
				{:else}
					<div
						class="body-render"
						class:markdown={bodyHtml !== null}
						class:plain-text={bodyHtml === null}
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
							<span class="body-placeholder">Add a description…</span>
						{:else if bodyHtml !== null}
							{@html bodyHtml}
						{:else}
							{body}
						{/if}
					</div>
				{/if}
			</section>

			<section class="block">
				<span class="block__title">Comments ({detail.comments.length})</span>
				{#if detail.comments.length === 0}
					<div class="muted comment-empty">No comments yet.</div>
				{:else}
					<ul class="comments">
						{#each detail.comments as entry (entry.githubId)}
							<li class="comment">
								<Avatar
									login={entry.author?.login ?? 'ghost'}
									avatarUrl={entry.author?.avatarUrl}
									size={20}
								/>
								<div class="comment__main">
									<div class="comment__head">
										<strong>{entry.author?.login ?? 'ghost'}</strong>
										<span class="muted" title={absoluteTime(entry.createdAt)}>
											{relativeTime(entry.createdAt)}
										</span>
									</div>
									<div class="comment__body markdown">{@html entry.bodyHtml}</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		<section class="composer">
			<textarea
				class="composer__input"
				value={comment}
				oninput={(e) => (comment = e.currentTarget.value)}
				placeholder="Add a comment…"
				rows="2"
			></textarea>
			<div class="composer__actions">
				<button
					class="primary-btn"
					type="button"
					onclick={submitComment}
					disabled={comment.trim().length === 0 || busy === 'comment'}
				>
					{#if busy === 'comment'}<Spinner size={13} />{/if}
					Comment
				</button>
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

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		width: var(--inspector-width);
		flex: none;
		height: 100%;
		background: var(--color-surface-layer-1);
		border-radius: var(--island-radius);
		overflow: hidden;
	}

	/* Embedded in the master–detail split: fill the flexible detail column. */
	.inspector--fill {
		width: 100%;
		flex: 1;
		min-width: 0;
	}

	.inspector__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		height: var(--island-header-height);
		padding: 0 var(--space-lg);
		background: var(--color-island-header);
		flex: none;
	}

	.crumb {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		overflow: hidden;
		min-width: 0;
	}

	.crumb__repo {
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.crumb__sep {
		color: var(--color-text-muted);
	}

	.crumb__number {
		color: var(--color-text-muted);
	}

	.crumb__meta {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.inspector__actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex: none;
	}

	.icon-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.icon-link:hover {
		background: var(--color-surface-layer-2);
		color: var(--color-text-primary);
	}

	.inspector__body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		padding: var(--space-xl) var(--space-lg);
		overflow-y: auto;
	}

	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-xl);
		color: var(--color-text-muted);
	}

	.placeholder--error {
		color: var(--color-accent-red);
	}

	.title-edit {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.title-input {
		flex: 1;
		min-width: 0;
		padding: var(--space-xs) var(--space-sm);
		margin-left: calc(var(--space-sm) * -1);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.02em;
		line-height: 1.25;
		color: var(--color-nav-title);
		transition: background var(--transition-fast);
	}

	.title-input:hover {
		background: var(--color-row-hover);
	}

	.title-input:focus {
		background: var(--color-surface-layer-2);
		border-color: var(--color-border-subtle);
		outline: none;
	}

	.save-btn,
	.primary-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		height: 28px;
		padding: 0 var(--space-md);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.primary-btn {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-on-primary);
		font-weight: var(--weight-medium);
	}

	.primary-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.banner {
		padding: var(--space-sm);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		border: 1px solid transparent;
	}

	.banner--error {
		background: color-mix(in srgb, var(--color-accent-red) 14%, transparent);
		border-color: color-mix(in srgb, var(--color-accent-red) 40%, transparent);
		color: var(--color-accent-red);
	}

	.banner--warn {
		background: color-mix(in srgb, var(--color-accent-amber) 14%, transparent);
		border-color: color-mix(in srgb, var(--color-accent-amber) 40%, transparent);
		color: var(--color-accent-amber);
	}

	/* Borderless property pills (Linear-style) — no container, no uppercase
	   labels; the semantic icon and value text carry the meaning. */
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs);
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.block__head {
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	.block__tools {
		display: flex;
		gap: var(--space-xs);
	}

	.block__title {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--color-text-muted);
	}

	/* Description renders as an open document, not a boxed field. */
	.body-render {
		min-height: 48px;
		padding: var(--space-xs) var(--space-sm);
		margin: 0 calc(var(--space-sm) * -1);
		border-radius: var(--radius-sm);
		font-family: var(--font-sans);
		font-size: var(--text-md);
		line-height: 1.6;
		color: var(--color-text-secondary);
		cursor: text;
		transition: background var(--transition-fast);
	}

	.body-render:hover {
		background: var(--color-row-hover);
	}

	.body-placeholder {
		color: var(--color-text-muted);
	}

	.body-render:hover .body-placeholder {
		color: var(--color-text-secondary);
	}

	.body-edit,
	.composer__input {
		width: 100%;
		padding: var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		line-height: 1.5;
		color: var(--color-text-primary);
		resize: vertical;
	}

	.muted {
		color: var(--color-text-muted);
	}

	.comments {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.comment {
		display: flex;
		gap: var(--space-sm);
	}

	.comment__main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xxs);
	}

	.comment__head {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
		font-size: var(--text-sm);
	}

	.comment__body {
		font-size: var(--text-base);
		color: var(--color-text-secondary);
	}

	.comment-empty {
		font-size: var(--text-sm);
	}

	.composer {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		background: var(--color-island-header);
		flex: none;
	}

	.composer__actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
