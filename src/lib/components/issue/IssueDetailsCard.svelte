<script lang="ts">
	import { Button, Card, CardBody } from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { severityWord } from '#lib/components/issue/bug-vocabulary';
	import DelayList from '#lib/components/issue/DelayList.svelte';
	import EpicProperty from '#lib/components/issue/EpicProperty.svelte';
	import IssueTimeCard from '#lib/components/issue/IssueTimeCard.svelte';
	import RecordDelayDialog from '#lib/components/issue/RecordDelayDialog.svelte';
	import { absoluteTime } from '#lib/time';
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
		onwatch
	}: Props = $props();

	let delayDialogOpen = $state(false);

	const reporter = $derived(issue.author?.login ?? '—');
</script>

<Card>
	<CardBody>
		<h2 class="h6 mb-3">Details</h2>
		<dl class="row small mb-0">
			<dt class="col-5 fw-normal text-body-secondary">Repository</dt>
			<dd class="col-7 mb-2 text-break">{issue.repo}</dd>

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
						<StatusText blocked />
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
