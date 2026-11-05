<script lang="ts">
	import { Button, Card, CardBody, Input } from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import BlockedText from '#lib/components/common/BlockedText.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { severityWord } from '#lib/components/issue/bug-vocabulary';
	import DelayList from '#lib/components/issue/DelayList.svelte';
	import EpicProperty from '#lib/components/issue/EpicProperty.svelte';
	import IssueTimeCard from '#lib/components/issue/IssueTimeCard.svelte';
	import RecordDelayDialog from '#lib/components/issue/RecordDelayDialog.svelte';
	import { absoluteTime } from '#lib/time';
	import { recheckDateLabel, toISODate } from '#lib/attention';
	import {
		isWaitingStale,
		WAITING_REASON_LABELS,
		WAITING_REASONS,
		waitingDays,
		waitingReasonLabel,
		type WaitingReason
	} from '#lib/waiting';
	import type { IssueListItem, RenderedIssueDetail } from '#lib/server/issues/types';

	/**
	 * Composition A's Details card: static metadata followed by the time and
	 * delay surfaces, which carry their own actions. The only shared controls
	 * here are the block (or unblock) action and the watching toggle; both stay
	 * behind `mayWrite`. Epic membership stays in `EpicProperty` so it remains
	 * editable from the card.
	 */
	interface Props {
		issue: IssueListItem;
		detail: RenderedIssueDetail;
		mayWrite: boolean;
		/** The viewer watches this issue. */
		watching: boolean;
		watchBusy: boolean;
		/** A structured block/unblock dialog is available for this issue. */
		canEdit: boolean;
		/** The issue is currently blocked (flag or body metadata). */
		blocked: boolean;
		busy: string | null;
		onblock: (mode: 'block' | 'unblock') => void;
		onwatch: () => void;
		/** Set/update the local waiting state, or clear it with `null`. */
		onwaiting: (
			input: {
				reason: WaitingReason;
				note: string | null;
				recheckOn: string | null;
			} | null
		) => void;
	}

	let {
		issue,
		detail,
		mayWrite,
		watching,
		watchBusy,
		canEdit,
		blocked,
		busy,
		onblock,
		onwatch,
		onwaiting
	}: Props = $props();

	let delayDialogOpen = $state(false);

	const reporter = $derived(issue.author?.login ?? '—');

	// Waiting is Funnel-local state, so the form is seeded from `detail.waiting`
	// and re-seeded after a reload; it never becomes part of `issue` overlays.
	let waitingReason = $state<WaitingReason>('needs-info');
	let waitingNote = $state('');
	let waitingRecheck = $state('');
	$effect(() => {
		const waiting = detail.waiting;
		waitingReason = waiting?.reason ?? 'needs-info';
		waitingNote = waiting?.note ?? '';
		waitingRecheck = waiting?.recheckOn ?? '';
	});
	const waitingStale = $derived(
		detail.waiting ? isWaitingStale(detail.waiting) : false
	);
	const waitingAge = $derived(
		detail.waiting ? waitingDays(detail.waiting) : 0
	);

	function submitWaiting() {
		onwaiting({
			reason: waitingReason,
			note: waitingNote.trim() || null,
			recheckOn: waitingRecheck || null
		});
	}
</script>

<Card>
	<CardBody>
		<h2 class="h6 mb-3">Details</h2>
		<dl class="row small mb-0">
			<dt class="col-5 fw-normal text-body-secondary">Repository</dt>
			<dd class="col-7 mb-2 text-break">{issue.repo}</dd>

			{#if issue.issueType}
				<dt class="col-5 fw-normal text-body-secondary">Type</dt>
				<dd class="col-7 mb-2 text-break">{issue.issueType}</dd>
			{/if}

			<dt class="col-5 fw-normal text-body-secondary">Epic</dt>
			<dd class="col-7 mb-2">
				{#if detail.epic || detail.issue.isEpic || mayWrite}
					<EpicProperty
						issue={detail.issue}
						parent={detail.epic}
						repo={issue.repo}
						number={issue.number}
						{mayWrite}
					/>
				{:else}
					<span class="text-body-secondary">—</span>
				{/if}
			</dd>

			<dt class="col-5 fw-normal text-body-secondary">Severity</dt>
			<dd class="col-7 mb-2">{severityWord(issue.impact)}</dd>

			<dt class="col-5 fw-normal text-body-secondary">Reporter</dt>
			<dd class="col-7 mb-2 text-break">{reporter}</dd>

			<dt class="col-5 fw-normal text-body-secondary">Opened</dt>
			<dd class="col-7 mb-2 text-break">
				<span title={absoluteTime(issue.createdAt)}>{timeAgo(issue.createdAt)}</span>
				by {reporter}
			</dd>

			<dt class="col-5 fw-normal text-body-secondary">Updated</dt>
			<dd class="col-7 mb-2 text-break">
				<span title={absoluteTime(issue.updatedAt)}>{timeAgo(issue.updatedAt)}</span>
			</dd>

			<dt class="col-5 fw-normal text-body-secondary">Blocked</dt>
			<dd class="col-7 mb-2">
				<span class="d-flex flex-wrap align-items-center gap-2">
					{#if blocked}
						<BlockedText />
						{#if mayWrite}
							<Button
								color="link"
								size="sm"
								class="text-decoration-none px-1 py-0"
								disabled={busy === 'blocked' || !canEdit}
								onclick={() => onblock('unblock')}
							>
								Unblock
							</Button>
						{/if}
					{:else}
						<span>Not blocked</span>
						{#if mayWrite}
							<Button
								color="link"
								size="sm"
								class="text-decoration-none px-1 py-0"
								title="Block issue"
								disabled={busy === 'blocked' || !canEdit}
								onclick={() => onblock('block')}
							>
								Block issue
							</Button>
						{/if}
					{/if}
				</span>
			</dd>

			<dt class="col-5 fw-normal text-body-secondary">Watching</dt>
			<dd class="col-7 mb-0">
				{#if mayWrite}
					<Button
						color="link"
						size="sm"
						class="text-decoration-none px-0 py-0"
						disabled={watchBusy || !canEdit}
						aria-pressed={watching}
						onclick={onwatch}
					>
						{#if watchBusy}
							<Spinner size={12} />
						{:else}
							{watching ? 'Watching' : 'Not watching'}
						{/if}
					</Button>
				{:else}
					<span>{watching ? 'Watching' : 'Not watching'}</span>
				{/if}
			</dd>
		</dl>

		<div class="mt-3 border-top pt-3">
			<div class="d-flex align-items-baseline justify-content-between gap-2 mb-2">
				<h3 class="h6 mb-0">Waiting</h3>
				{#if detail.waiting}
					<span class="small text-body-secondary">
						Since {recheckDateLabel(toISODate(new Date(detail.waiting.waitingSince)))}
					</span>
				{/if}
			</div>

			{#if detail.waiting}
				<p class="small text-body-secondary mb-2">
					<span class="d-inline-flex align-items-center gap-1 text-body">
						<i class="bi bi-hourglass-split" aria-hidden="true"></i>
						{waitingReasonLabel(detail.waiting.reason)}
					</span>
					{#if detail.waiting.recheckOn}
						· Re-check {recheckDateLabel(detail.waiting.recheckOn)}
					{/if}
					{#if waitingStale}
						<span class="badge text-bg-warning ms-1">Stale · {waitingAge}d</span>
					{/if}
				</p>
				{#if detail.waiting.note}
					<p class="small text-body-secondary mb-2">{detail.waiting.note}</p>
				{/if}
			{:else}
				<p class="small text-body-secondary mb-2">Not waiting on anyone.</p>
			{/if}

			{#if mayWrite}
				<label class="form-label small" for="issue-waiting-reason">Reason</label>
				<Input
					id="issue-waiting-reason"
					type="select"
					class="mb-2"
					value={waitingReason}
					disabled={busy === 'waiting' || !canEdit}
					on:change={(event) =>
						(waitingReason = event.currentTarget.value as WaitingReason)}
				>
					{#each WAITING_REASONS as reason (reason)}
						<option value={reason}>{WAITING_REASON_LABELS[reason]}</option>
					{/each}
				</Input>

				<label class="form-label small" for="issue-waiting-note">Note</label>
				<Input
					id="issue-waiting-note"
					type="text"
					class="mb-2"
					placeholder="Optional detail"
					value={waitingNote}
					disabled={busy === 'waiting' || !canEdit}
					on:input={(event) => (waitingNote = event.currentTarget.value)}
				/>

				<label class="form-label small" for="issue-waiting-recheck">Re-check date</label>
				<Input
					id="issue-waiting-recheck"
					type="date"
					class="mb-2"
					value={waitingRecheck}
					disabled={busy === 'waiting' || !canEdit}
					on:change={(event) => (waitingRecheck = event.currentTarget.value)}
				/>

				<div class="d-flex flex-wrap align-items-center gap-2">
					<Button
						color="outline-secondary"
						size="sm"
						disabled={busy === 'waiting' || !canEdit}
						onclick={submitWaiting}
					>
						{detail.waiting ? 'Update waiting' : 'Mark waiting'}
					</Button>
					{#if detail.waiting}
						<Button
							color="link"
							size="sm"
							class="text-decoration-none px-1"
							disabled={busy === 'waiting' || !canEdit}
							onclick={() => onwaiting(null)}
						>
							Clear waiting
						</Button>
					{/if}
				</div>
				<div class="form-text">
					Local to Funnel. The issue body, labels and comments are not changed.
				</div>
			{/if}
		</div>

		<div class="mt-4">
			<IssueTimeCard time={detail.time} />
		</div>

		<div class="mt-4">
			<DelayList
				delays={detail.delays}
				repo={issue.repo}
				number={issue.number}
				{mayWrite}
				onrecord={() => (delayDialogOpen = true)}
			/>
		</div>
	</CardBody>
</Card>

<RecordDelayDialog
	open={delayDialogOpen}
	repo={issue.repo}
	number={issue.number}
	onopenchange={(open) => (delayDialogOpen = open)}
/>
