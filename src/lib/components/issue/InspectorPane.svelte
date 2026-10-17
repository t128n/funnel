<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import {
		addIssueComment,
		addIssueLabels,
		fetchIssueDetail,
		removeIssueLabel,
		updateIssue,
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
	import type { IssueDetail, UserRef } from '#lib/server/issues/types';

	interface Props {
		repo: string;
		number: number;
		githubUrl: string;
		onclose: () => void;
	}

	let { repo, number, githubUrl, onclose }: Props = $props();

	let detail = $state<IssueDetail | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	let title = $state('');
	let body = $state('');
	let comment = $state('');
	let editingBody = $state(false);

	const issue = $derived(detail?.issue ?? null);
	const titleDirty = $derived(issue !== null && title.trim() !== issue.title);
	const bodyDirty = $derived(detail !== null && body !== detail.body);

	const statusValue = $derived(issue?.status ?? null);
	const priorityValue = $derived(issue?.priority ?? null);
	const sizeValue = $derived(issue?.size ?? null);

	const assigneeLogins = $derived(issue?.assignees.map((a) => a.login) ?? []);
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

	async function load() {
		loading = true;
		error = null;
		const result = await fetchIssueDetail(repo, number);
		if (result.ok) {
			detail = result.value;
			title = result.value.issue.title;
			body = result.value.body;
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
					: issue.assignees
			}
		};
		if (patch.body !== undefined) body = patch.body;
		return true;
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

<aside class="inspector" aria-label="Issue inspector">
	<header class="inspector__head">
		<div class="inspector__ident">
			<span class="mono repo-badge">{repo}</span>
			<span class="mono number">#{number}</span>
			{#if issue}
				<Chip
					label={issue.state === 'closed' ? 'closed' : 'open'}
					color={issue.state === 'closed' ? 'be95ff' : '42be65'}
				/>
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

			<section class="meta">
				<div class="meta__field">
					<span class="meta__label">Status</span>
					<SingleSelect
						label="No status"
						options={STATUS_OPTIONS}
						value={statusValue}
						onselect={setStatus}
						disabled={busy === 'status'}
					/>
				</div>
				<div class="meta__field">
					<span class="meta__label">Priority</span>
					<SingleSelect
						label="No priority"
						options={PRIORITY_OPTIONS}
						value={priorityValue}
						onselect={setPriority}
						allowClear
						disabled={busy === 'priority'}
					/>
				</div>
				<div class="meta__field">
					<span class="meta__label">Size</span>
					<SingleSelect
						label="No size"
						options={SIZE_OPTIONS}
						value={sizeValue}
						onselect={setSize}
						allowClear
						disabled={busy === 'size'}
					/>
				</div>
			</section>

			<section class="meta">
				<div class="meta__field">
					<span class="meta__label">Assignees</span>
					<MultiSelect
						label="Unassigned"
						options={assigneeOptions.map((u) => ({ value: u.login, label: u.login }))}
						selected={assigneeLogins}
						onselect={setAssignees}
						disabled={busy === 'assignees'}
					/>
				</div>
				<div class="meta__field">
					<span class="meta__label">Labels</span>
					<MultiSelect
						label="No labels"
						options={labelOptions}
						selected={selectedLabels}
						onselect={setLabels}
						disabled={busy === 'labels'}
					/>
				</div>
			</section>

			<div class="assignee-strip">
				{#if issue.assignees.length > 0}
					{#each issue.assignees as person (person.githubId)}
						<Avatar login={person.login} avatarUrl={person.avatarUrl} size={20} />
					{/each}
				{/if}
				{#if issue.author}
					<span class="byline">
						opened by <strong>{issue.author.login}</strong>
						· <span title={absoluteTime(issue.updatedAt)}>{relativeTime(issue.updatedAt)}</span>
					</span>
				{/if}
			</div>

			<section class="block">
				<div class="block__head">
					<span class="block__title">Description</span>
					{#if busy === 'body'}
						<Spinner size={13} />
					{:else if editingBody}
						<div class="block__tools">
							<button class="save-btn" type="button" onclick={cancelBody}>Cancel</button>
							<button class="save-btn" type="button" onclick={saveBody} disabled={!bodyDirty}>
								Save
							</button>
						</div>
					{/if}
				</div>
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
						class="body-render plain-text"
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
						{#if body.trim().length > 0}
							{body}
						{:else}
							<span class="muted">No description. Click to add one.</span>
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
									<div class="comment__body plain-text">{entry.body}</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="composer">
				<textarea
					class="composer__input"
					value={comment}
					oninput={(e) => (comment = e.currentTarget.value)}
					placeholder="Add a comment…"
					rows="3"
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
		</div>
	{/if}
</aside>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		width: var(--inspector-width);
		flex: none;
		height: 100%;
		background: var(--color-surface-layer-1);
		border-left: 1px solid var(--color-border-subtle);
		overflow: hidden;
	}

	.inspector__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		height: var(--topbar-height);
		padding: 0 var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.inspector__ident {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		overflow: hidden;
	}

	.repo-badge {
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.number {
		color: var(--color-text-muted);
	}

	.inspector__actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
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
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-md);
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
		padding: var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.01em;
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

	.meta {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: var(--space-sm);
	}

	.meta:last-of-type {
		grid-template-columns: 1fr 1fr;
	}

	.meta__field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xxs);
		min-width: 0;
	}

	.meta__label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.assignee-strip {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-wrap: wrap;
	}

	.byline {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.block__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.block__tools {
		display: flex;
		gap: var(--space-xs);
	}

	.block__title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.body-render,
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
	}

	.body-render {
		cursor: text;
		min-height: 48px;
	}

	.body-edit,
	.composer__input {
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
		border-top: 1px solid var(--color-border-subtle);
		padding-top: var(--space-md);
	}

	.composer__actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
