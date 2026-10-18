<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import IssueActionDialog from '#lib/components/issue/IssueActionDialog.svelte';
	import {
		closeIssue,
		reopenIssue,
		updateIssue,
		type CloseReason
	} from '#lib/client/mutations';
	import { mutate, overlayKey } from '#lib/client/optimistic.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { canonicalLabel, STATUS_OPTIONS } from '#lib/labels';
	import type { IssueListItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Item from '#lib/components/ui/item/index.js';

	interface Props {
		issue: IssueListItem;
	}

	let { issue }: Props = $props();

	let busy = $state(false);

	/** Structured close/reopen dialog (SPEC §5.2.3). */
	let dialogMode = $state<'close' | 'reopen' | null>(null);
	/** Status chosen while reopening from Done; applied after the note. */
	let pendingStatus = $state<string | null>(null);

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
		// Optimistic: the overlay moves the card to its new column at once.
		busy = true;
		await mutate({
			key: overlayKey(issue.repo, issue.number),
			patch: { status: value },
			failure: 'Could not update status',
			commit: () => updateIssue(issue.repo, issue.number, { status: value })
		});
		busy = false;
	}

	function openDialog(mode: 'close' | 'reopen') {
		dialogMode = mode;
	}

	/**
	 * Close/reopen with a required note, posted as a comment first. The overlay
	 * moves the card immediately; on failure it rolls back and the toast (the
	 * card may have unmounted mid-flight) reports the error.
	 */
	async function confirmDialog(payload: { reason: CloseReason; note: string }) {
		busy = true;
		const reopening = dialogMode === 'reopen';
		await mutate({
			key: overlayKey(issue.repo, issue.number),
			patch: reopening
				? {
						state: 'open',
						stateReason: null,
						closedAt: null,
						...(pendingStatus ? { status: pendingStatus } : {})
					}
				: { state: 'closed', stateReason: payload.reason, closedAt: Date.now() },
			failure: reopening ? 'Could not reopen issue' : 'Could not close issue',
			commit: () =>
				reopening
					? reopenIssue(
							issue.repo,
							issue.number,
							payload.note,
							pendingStatus ?? undefined
						)
					: closeIssue(issue.repo, issue.number, payload.reason, payload.note)
		});
		busy = false;
		dialogMode = null;
		pendingStatus = null;
	}

	function open() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<Item.Root
	variant="outline"
	size="sm"
	class="bg-card hover:bg-accent cursor-pointer flex-col items-stretch gap-2 p-2"
	role="button"
	tabindex={0}
	onclick={open}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			open();
		}
	}}
>
	<div class="flex items-start gap-2">
		<Item.Content class="min-w-0 gap-1">
			<div class="flex items-center gap-1">
				<span
					class="mono text-muted-foreground min-w-0 truncate text-xs"
					title={`${issue.repo}#${issue.number}`}
				>
					{issue.repo}#{issue.number}
				</span>
			</div>

			<div
				class={cn('line-clamp-2 text-sm', closed ? 'text-muted-foreground' : 'text-foreground')}
				title={issue.title}
			>
				{issue.title}
			</div>

			<div class="flex flex-wrap items-center gap-1">
				{#if issue.priority}
					<Chip label={issue.priority} color={priorityColor} mono />
				{/if}
				{#if issue.size}
					<Chip label={issue.size} color={sizeColor} variant="outline" mono />
				{/if}
				{#if issue.labelConflict}
					<TriangleAlertIcon class="text-warning size-3.5" title="Conflicting reserved labels" />
				{/if}
			</div>
		</Item.Content>

		<Item.Actions class="shrink-0 flex-col items-end gap-1">
			{#if busy}
				<span class="inline-flex"><Spinner size={12} /></span>
			{/if}
			{#if issue.assignees.length > 0}
				<div class="flex items-center gap-0.5">
					{#each issue.assignees.slice(0, 3) as person (person.githubId)}
						<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
					{/each}
				</div>
			{/if}
		</Item.Actions>
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
</Item.Root>

<IssueActionDialog
	open={dialogMode !== null}
	mode={dialogMode ?? 'close'}
	busy={busy}
	error={null}
	onopenchange={(open) => {
		if (!open && !busy) {
			dialogMode = null;
			pendingStatus = null;
		}
	}}
	onconfirm={(payload) => void confirmDialog(payload)}
/>
