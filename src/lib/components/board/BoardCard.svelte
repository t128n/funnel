<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import {
		closeIssue,
		reopenIssue,
		updateIssue,
		type CloseReason,
		type UpdateIssuePatch
	} from '#lib/client/mutations';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { canonicalLabel, STATUS_OPTIONS } from '#lib/labels';
	import type { IssueListItem } from '#lib/server/issues/types';

	interface Props {
		issue: IssueListItem;
	}

	let { issue }: Props = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);

	/** Structured close/reopen dialog (SPEC §5.2.3). */
	let dialogMode = $state<'close' | 'reopen' | null>(null);
	/** Status chosen while reopening from Done; applied after the note. */
	let pendingStatus = $state<string | null>(null);
	let resolveError = $state<string | null>(null);

	const closed = $derived(issue.state === 'closed');
	const priorityColor = $derived(
		issue.priority ? (canonicalLabel(issue.priority)?.color ?? null) : null
	);
	const sizeColor = $derived(
		issue.size ? (canonicalLabel(issue.size)?.color ?? null) : null
	);

	const statusOptions = [
		...STATUS_OPTIONS,
		{ value: 'done', label: 'Done', color: 'be95ff' }
	];
	const statusValue = $derived(closed ? 'done' : (issue.status ?? ''));

	async function changeStatus(value: string | null) {
		if (!value || busy) return;
		// Done is a state transition, not a label: route it through the same
		// structured close dialog the Inspector uses (SPEC §5.2.3).
		if (value === 'done') {
			if (!closed) openDialog('close');
			return;
		}
		// Reopenings require a note posted before the state change.
		if (closed) {
			pendingStatus = value;
			openDialog('reopen');
			return;
		}
		await applyPatch({ status: value });
	}

	/** Plain pessimistic patch used for open-issue label changes. */
	async function applyPatch(patch: UpdateIssuePatch) {
		busy = true;
		error = null;
		const result = await updateIssue(issue.repo, issue.number, patch);
		busy = false;
		if (!result.ok) {
			error = result.error;
			return;
		}
		await refreshAll();
	}

	function openDialog(mode: 'close' | 'reopen') {
		resolveError = null;
		dialogMode = mode;
	}

	/** Close/reopen with a required note, posted as a comment first. */
	async function confirmDialog(payload: { reason: CloseReason; note: string }) {
		busy = true;
		resolveError = null;
		const result =
			dialogMode === 'reopen'
				? await reopenIssue(
						issue.repo,
						issue.number,
						payload.note,
						pendingStatus ?? undefined
					)
				: await closeIssue(issue.repo, issue.number, payload.reason, payload.note);
		busy = false;
		if (!result.ok) {
			resolveError = result.error;
			return;
		}
		dialogMode = null;
		pendingStatus = null;
		await refreshAll();
	}

	function open() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<div
	class="card"
	class:card--closed={closed}
	role="button"
	tabindex="0"
	onclick={open}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			open();
		}
	}}
>
	<div class="card__top">
		<span class="mono repo">{issue.repo}</span>
		<span class="mono number">#{issue.number}</span>
		{#if busy}<Spinner size={12} />{/if}
	</div>

	<div class="card__title" title={issue.title}>{issue.title}</div>

	<div class="card__chips">
		{#if issue.priority}
			<Chip label={issue.priority.toUpperCase()} color={priorityColor} mono />
		{/if}
		{#if issue.size}
			<Chip label={issue.size} color={sizeColor} variant="outline" mono />
		{/if}
		{#if issue.labelConflict}
			<span class="conflict" title="Conflicting reserved labels">⚠</span>
		{/if}
		<div class="card__assignees">
			{#each issue.assignees.slice(0, 3) as person (person.githubId)}
				<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
			{/each}
		</div>
	</div>

	<!-- Stop click/keyboard from bubbling so the picker doesn't open the pane. -->
	<div
		class="card__picker"
		role="presentation"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<SingleSelect
			label="Status"
			options={statusOptions}
			value={statusValue || null}
			onselect={changeStatus}
			disabled={busy}
		/>
	</div>

	{#if error}
		<div class="card__error">{error}</div>
	{/if}
</div>

<IssueActionDialog
	open={dialogMode !== null}
	mode={dialogMode ?? 'close'}
	busy={busy}
	error={resolveError}
	onopenchange={(open) => {
		if (!open && !busy) {
			dialogMode = null;
			pendingStatus = null;
		}
	}}
	onconfirm={(payload) => void confirmDialog(payload)}
/>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
		outline: none;
		transition: background var(--transition-fast);
	}

	.card:hover,
	.card:focus-visible {
		background: var(--color-surface-overlay);
		border-color: var(--color-border-strong);
	}

	.card--closed .card__title {
		color: var(--color-text-muted);
	}

	.card__top {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.repo {
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.number {
		color: var(--color-text-muted);
	}

	.card__title {
		font-size: var(--text-base);
		color: var(--color-text-primary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card__chips {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-wrap: wrap;
	}

	.card__assignees {
		display: flex;
		gap: 2px;
		margin-left: auto;
	}

	.conflict {
		color: var(--color-accent-amber);
	}

	.card__error {
		font-size: var(--text-xs);
		color: var(--color-accent-red);
	}
</style>
