<script module lang="ts">
	/**
	 * Row labels shared by the Inbox table and its contract test. Pure so the
	 * formatting rules can be checked without mounting the component.
	 */

	/** Intake source with the production fallback for unsourced submissions. */
	export function submissionSource(source: string | null): string {
		return source?.trim() || 'Intake';
	}

	/** Repo a submission would be accepted into; an em dash when none is set. */
	export function submissionRepoLabel(repo: string): string {
		return repo.trim() || '—';
	}

	/** Submission title with the same placeholder the detail page uses. */
	export function submissionTitle(title: string): string {
		return title.trim() || 'Untitled submission';
	}
</script>

<script lang="ts">
	import type { ActionResult } from '$app/forms';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import {
		Alert,
		Button,
		Input,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader,
		Table
	} from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import SnoozeControl from '#lib/components/inbox/SnoozeControl.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { inboxActionUrl } from '#lib/client/inbox';
	import {
		mutate,
		overlayKey,
		removeSnoozedIssue,
		removeSubmission,
		restoreSnoozedIssue,
		restoreSubmission
	} from '#lib/client/optimistic.svelte';
	import { updateIssue } from '#lib/client/mutations';
	import { issuePath, submissionPath } from '#lib/issue-url';
	import { issueRef } from '#lib/issue-ref';
	import { STATUS_OPTIONS } from '#lib/labels';
	import { absoluteTime } from '#lib/time';
	import type { IssueListItem, RenderedInboxEntry } from '#lib/server/issues/types';

	/**
	 * The Inbox queue as one conventional Bootstrap table (Composition A §9).
	 *
	 * Staged submissions and untriaged issues share the six columns — Issue,
	 * Title, Repository, Source, Submitted, Triage — with submissions first.
	 * Submissions are accepted or declined inline; issues leave the queue when
	 * the Triage select commits a status through the same optimistic mutation
	 * the issue Inspector uses. Below `md` the Issue/Source/Submitted columns
	 * collapse into a line above and a metadata line below the title; below `lg`
	 * the Repository column goes too. Triage actions stay visible at every size.
	 */
	interface Props {
		entries: RenderedInboxEntry[];
		/** `owner/name` → project key, for the Issue column. */
		repoShortcodes?: Record<string, string>;
		/** Configured repositories, used when no intake default is set. */
		repos?: string[];
		/** Intake's configured default repository. */
		defaultRepo?: string;
		/** Called after the server confirms a submission left the queue. */
		onremove?: (key: string) => void;
		/** Brief success feedback owned by the page-level status region. */
		onnotice?: (message: string | null) => void;
	}

	let {
		entries,
		repoShortcodes = {},
		repos = [],
		defaultRepo = '',
		onremove,
		onnotice
	}: Props = $props();

	type SubmissionEntry = Extract<RenderedInboxEntry, { kind: 'submission' }>;
	type Busy = 'accept' | 'dismiss' | 'triage';

	/** Accept/decline target, resolved the same way the detail page resolves it. */
	const acceptRepo = $derived(defaultRepo.trim() || repos[0] || '');

	// The forms live on `/inbox`, so the action must run on that same route.
	// Keeping the current query in the action URL preserves the filter for a
	// no-JS post too (SvelteKit strips only the leading `/<action>` parameter).
	const acceptAction = $derived(inboxActionUrl(page.url.search, 'accept'));
	const dismissAction = $derived(inboxActionUrl(page.url.search, 'dismiss'));
	const undoAction = $derived(inboxActionUrl(page.url.search, 'undo'));

	let busy = $state<Record<string, Busy>>({});
	let error = $state<string | null>(null);
	let declining = $state<SubmissionEntry | null>(null);
	let dismissReason = $state('');
	let undoEventId = $state<string | null>(null);
	let undoSubmissionId = $state<string | null>(null);

	function entryKey(entry: RenderedInboxEntry): string {
		return entry.kind === 'submission'
			? `submission:${entry.submission.id}`
			: `issue:${entry.issue.repoId}:${entry.issue.number}`;
	}

	function issueKey(issue: IssueListItem): string {
		return `issue:${issue.repoId}:${issue.number}`;
	}

	function setBusy(key: string, state: Busy): void {
		busy[key] = state;
	}

	function clearBusy(key: string): void {
		delete busy[key];
	}

	/** Hide a submission the moment its decision is submitted. */
	function begin(id: string, state: Busy): void {
		error = null;
		onnotice?.(null);
		setBusy(id, state);
		removeSubmission(id);
	}

	/** Settle a decision: a failure puts the row back so it can be retried. */
	function settle(id: string, result: ActionResult, verb: 'accepted' | 'dismissed'): void {
		clearBusy(id);
		if (result.type === 'success') {
			// The fresh first page omits the consumed submission, but the loaded
			// window keeps its tail; drop the row so it cannot stay interactive.
			onremove?.(`submission:${id}`);
			if (verb === 'dismissed') {
				// The row is archived, not deleted: keep the appended event so the
				// inline alert can offer Undo without leaving the queue.
				undoEventId =
					typeof result.data?.eventId === 'string' ? result.data.eventId : null;
				undoSubmissionId = id;
				dismissReason = '';
				onnotice?.(null);
				return;
			}
			onnotice?.(`Submission ${verb}. It is no longer in the queue.`);
			return;
		}
		restoreSubmission(id);
		const message =
			result.type === 'failure' && typeof result.data?.message === 'string'
				? result.data.message
				: 'Could not complete the triage action. Try again.';
		error = message;
	}

	function startDecline(entry: SubmissionEntry): void {
		declining = entry;
		dismissReason = '';
		error = null;
	}

	async function triageIssue(issue: IssueListItem, status: string): Promise<void> {
		if (!status) return;
		const key = issueKey(issue);
		if (busy[key] !== undefined) return;
		error = null;
		setBusy(key, 'triage');
		const outcome = await mutate({
			key: overlayKey(issue.repo, issue.number),
			patch: { status },
			failure: 'Could not triage issue',
			notify: false,
			commit: () => updateIssue(issue.repo, issue.number, { status })
		});
		clearBusy(key);
		if (!outcome.ok) error = outcome.error;
	}

	function closeDecline(): void {
		if (declining === null) return;
		if (busy[declining.submission.id] !== undefined) return;
		declining = null;
	}

	/** Optimistically drop a snoozed submission; restored on failure. */
	function hideSnoozedSubmission(entry: SubmissionEntry): void {
		removeSubmission(entry.submission.id);
	}

	/** Optimistically drop a snoozed issue; restored on failure. */
	function hideSnoozedIssue(issue: IssueListItem): void {
		removeSnoozedIssue(issue.repo, issue.number);
	}

	function announceSnooze(label: string, until: number): void {
		onnotice?.(`Snoozed ${label} until ${absoluteTime(until)}.`);
	}

	function snoozeFailed(message: string): void {
		error = message;
		onnotice?.(null);
	}
</script>

{#if error}
	<Alert color="danger" class="border py-2 small mb-2">{error}</Alert>
{/if}

{#if undoEventId && undoSubmissionId}
	<Alert
		color="warning"
		class="border py-2 small mb-2 d-flex flex-wrap align-items-center justify-content-between gap-2"
	>
		<span class="d-inline-flex align-items-center gap-2">
			<i class="bi bi-archive" aria-hidden="true"></i>
			<span>Submission dismissed and archived.</span>
		</span>
		<form
			method="POST"
			action={undoAction}
			use:enhance={() => {
				return async ({ result, update }) => {
					await update({ reset: false, invalidateAll: true });
					if (result.type === 'success') {
						if (undoSubmissionId) restoreSubmission(undoSubmissionId);
						undoEventId = null;
						undoSubmissionId = null;
						onnotice?.('Submission restored to the queue.');
						return;
					}
					error =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: 'Could not undo the dismissal. Try again.';
				};
			}}
		>
			<input type="hidden" name="eventId" value={undoEventId} />
			<Button type="submit" color="outline-secondary" size="sm">Undo dismiss</Button>
		</form>
	</Alert>
{/if}

<div class="table-responsive border rounded">
	<Table hover class="inbox-table align-middle mb-0">
		<caption class="visually-hidden">Inbox triage queue</caption>
		<thead class="table-light">
			<tr>
				<th scope="col" class="small text-body-secondary d-none d-md-table-cell inbox-col-issue">
					Issue
				</th>
				<th scope="col" class="small text-body-secondary">Title</th>
				<th scope="col" class="small text-body-secondary d-none d-lg-table-cell">Repository</th>
				<th scope="col" class="small text-body-secondary d-none d-md-table-cell">Source</th>
				<th
					scope="col"
					class="small text-body-secondary d-none d-md-table-cell inbox-col-submitted"
				>
					Submitted
				</th>
				<th scope="col" class="small text-body-secondary text-end inbox-col-triage">Triage</th>
			</tr>
		</thead>
		<tbody>
			{#each entries as entry (entryKey(entry))}
				{#if entry.kind === 'submission'}
					{@const submission = entry.submission}
					{@const title = submissionTitle(submission.title)}
					{@const source = submissionSource(submission.source)}
					{@const repo = submissionRepoLabel(acceptRepo)}
					<tr>
						<td class="font-monospace small text-body-secondary text-nowrap d-none d-md-table-cell">
							—
						</td>
						<td class="min-w-0">
							<span class="font-monospace small text-body-secondary d-md-none d-block mb-1">
								Submission
							</span>
							<a
								href={submissionPath(submission.id)}
								class="link-primary text-decoration-none"
								title={title}
							>
								{title}
							</a>
							<div class="small text-body-secondary d-md-none mt-1">{repo} · {source}</div>
						</td>
						<td class="small d-none d-lg-table-cell">
							{#if acceptRepo.trim()}
								{repo}
							{:else}
								<span class="text-body-tertiary">—</span>
							{/if}
						</td>
						<td class="small text-body-secondary d-none d-md-table-cell">{source}</td>
						<td class="small text-body-secondary text-nowrap d-none d-md-table-cell">
							<time
								datetime={new Date(submission.createdAt).toISOString()}
								title={absoluteTime(submission.createdAt)}
							>
								{timeAgo(submission.createdAt)}
							</time>
						</td>
						<td class="text-end text-nowrap">
							<div class="d-inline-flex align-items-center justify-content-end gap-1">
								<form
									method="POST"
									action={acceptAction}
									class="d-inline-flex"
									use:enhance={() => {
										begin(submission.id, 'accept');
										return async ({ result, update }) => {
											await update({ reset: false, navigate: false });
											settle(submission.id, result, 'accepted');
										};
									}}
								>
									<input type="hidden" name="id" value={submission.id} />
									<input type="hidden" name="repo" value={acceptRepo} />
									<input type="hidden" name="size" value="" />
									<Button
										type="submit"
										color="primary"
										size="sm"
										disabled={busy[submission.id] !== undefined}
										aria-label={`Accept submission: ${title}`}
									>
										{#if busy[submission.id] === 'accept'}
											<span class="d-inline-flex align-items-center me-1">
												<Spinner size={12} />
											</span>
										{/if}
										Accept
									</Button>
								</form>
								<SnoozeControl
									target={{ kind: 'submission', id: submission.id }}
									label={`submission ${title}`}
									disabled={busy[submission.id] !== undefined}
									onstart={() => hideSnoozedSubmission(entry)}
									onsuccess={(until) => announceSnooze('submission', until)}
									onfailure={(message) => {
										restoreSubmission(submission.id);
										snoozeFailed(message);
									}}
								/>
								<Button
									type="button"
									color="outline-secondary"
									size="sm"
									disabled={busy[submission.id] !== undefined}
									onclick={() => startDecline(entry)}
									aria-label={`Decline submission: ${title}`}
								>
									Decline
								</Button>
							</div>
						</td>
					</tr>
				{:else}
					{@const issue = entry.issue}
					{@const ref = issueRef(issue.repo, issue.number, repoShortcodes)}
					{@const title = issue.title.trim() || 'Untitled'}
					<tr>
						<td class="font-monospace small text-body-secondary text-nowrap d-none d-md-table-cell">
							{ref}
						</td>
						<td class="min-w-0">
							<span class="font-monospace small text-body-secondary d-md-none d-block mb-1">
								{ref}
							</span>
							<a
								href={issuePath('issues', issue.repo, issue.number)}
								class="link-primary text-decoration-none"
								title={title}
							>
								{title}
							</a>
							<div class="small text-body-secondary d-md-none mt-1">
								{issue.repo} · GitHub
							</div>
						</td>
						<td class="small d-none d-lg-table-cell">{issue.repo}</td>
						<td class="small text-body-secondary d-none d-md-table-cell">GitHub</td>
						<td class="small text-body-secondary text-nowrap d-none d-md-table-cell">
							<time
								datetime={new Date(issue.createdAt).toISOString()}
								title={absoluteTime(issue.createdAt)}
							>
								{timeAgo(issue.createdAt)}
							</time>
						</td>
						<td class="text-end text-nowrap">
							<div class="d-inline-flex align-items-center justify-content-end gap-1">
								<SnoozeControl
									target={{ kind: 'issue', repo: issue.repo, number: issue.number }}
									label={ref}
									disabled={busy[issueKey(issue)] !== undefined}
									onstart={() => hideSnoozedIssue(issue)}
									onsuccess={(until) => announceSnooze(ref, until)}
									onfailure={(message) => {
										restoreSnoozedIssue(issue.repo, issue.number);
										snoozeFailed(message);
									}}
								/>
								<Input
									type="select"
									bsSize="sm"
									class="triage-select"
									aria-label={`Triage ${ref}`}
									value=""
									disabled={busy[issueKey(issue)] !== undefined}
									on:change={(event) => void triageIssue(issue, event.currentTarget.value)}
								>
									<option value="" disabled>Triage…</option>
									{#each STATUS_OPTIONS as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</Input>
							</div>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</Table>
</div>

<Modal isOpen={declining !== null} toggle={closeDecline}>
	<ModalHeader toggle={closeDecline}>Dismiss submission?</ModalHeader>
	<ModalBody>
		<p>
			This archives “{declining ? submissionTitle(declining.submission.title) : ''}” with your
			reason. You can undo it from the queue right after dismissing.
		</p>
		<label class="form-label" for="inbox-dismiss-reason">Reason</label>
		<textarea
			id="inbox-dismiss-reason"
			form="inbox-dismiss-form"
			name="reason"
			class="form-control"
			rows="3"
			maxlength="500"
			required
			placeholder="Why is this submission being dismissed?"
			bind:value={dismissReason}
		></textarea>
		<div class="form-text">Required, up to 500 characters.</div>
	</ModalBody>
	<ModalFooter>
		<Button
			color="outline-secondary"
			disabled={declining !== null && busy[declining.submission.id] !== undefined}
			onclick={closeDecline}
		>
			Keep submission
		</Button>
		<form
			id="inbox-dismiss-form"
			method="POST"
			action={dismissAction}
			use:enhance={() => {
				const id = declining?.submission.id;
				if (!id) return;
				begin(id, 'dismiss');
				return async ({ result, update }) => {
					await update({ reset: false, navigate: false });
					settle(id, result, 'dismissed');
					declining = null;
				};
			}}
		>
			<input type="hidden" name="id" value={declining?.submission.id ?? ''} />
			<Button
				type="submit"
				color="danger"
				size="sm"
				disabled={
					declining !== null &&
					(busy[declining.submission.id] !== undefined || dismissReason.trim().length === 0)
				}
			>
				{#if declining && busy[declining.submission.id] === 'dismiss'}
					<span class="d-inline-flex align-items-center me-1">
						<Spinner size={12} />
					</span>
				{/if}
				Dismiss submission
			</Button>
		</form>
	</ModalFooter>
</Modal>

<style>
	.inbox-col-issue {
		width: 7rem;
	}

	.inbox-col-submitted {
		width: 8rem;
	}

	.inbox-col-triage {
		width: 17rem;
	}
</style>
