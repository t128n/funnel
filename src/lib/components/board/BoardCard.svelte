<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import * as Alert from '#lib/components/ui/alert';
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
	import { cn } from '#lib/utils';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

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
		{ value: 'done', label: 'Done', color: 'var(--syntax-constant)' }
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
	class="bg-card hover:bg-accent focus-visible:ring-ring/50 flex cursor-pointer flex-col gap-2 border p-2 outline-none transition-colors focus-visible:ring-1"
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
	<div class="flex items-center gap-1">
		<span class="mono text-muted-foreground truncate text-xs" title={issue.repo}>{issue.repo}</span>
		<span class="mono text-muted-foreground/70 text-xs">#{issue.number}</span>
		{#if busy}
			<span class="ml-auto inline-flex"><Spinner size={12} /></span>
		{/if}
	</div>

	<div class={cn('line-clamp-2 text-sm', closed ? 'text-muted-foreground' : 'text-foreground')} title={issue.title}>
		{issue.title}
	</div>

	<div class="flex flex-wrap items-center gap-1">
		{#if issue.priority}
			<Chip label={issue.priority.toUpperCase()} color={priorityColor} mono />
		{/if}
		{#if issue.size}
			<Chip label={issue.size} color={sizeColor} variant="outline" mono />
		{/if}
		{#if issue.labelConflict}
			<TriangleAlertIcon class="text-warning size-3.5" title="Conflicting reserved labels" />
		{/if}
		<div class="ml-auto flex items-center gap-0.5">
			{#each issue.assignees.slice(0, 3) as person (person.githubId)}
				<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
			{/each}
		</div>
	</div>

	<!-- Stop click/keyboard from bubbling so the picker doesn't open the pane. -->
	<div
		class="flex"
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
		<Alert.Root variant="destructive">
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
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
