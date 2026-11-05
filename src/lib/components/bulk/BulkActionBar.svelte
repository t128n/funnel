<script lang="ts">
	import {
		Alert,
		Button,
		Dropdown,
		DropdownMenu,
		DropdownToggle,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { runBulk, type BulkTask } from '#lib/client/bulk-runner';
	import {
		bulkSelection,
		issueBulkKey,
		parseIssueBulkKey,
		submissionBulkKey,
		type BulkKey,
		type IssueSelectionRef
	} from '#lib/client/bulk-selection.svelte';
	import {
		addIssueLabels,
		dismissSubmission,
		snooze,
		updateIssue,
		type UpdateIssuePatch
	} from '#lib/client/mutations';
	import {
		mutate,
		overlayKey,
		removeSnoozedIssue,
		removeSubmission,
		type IssuePatch
	} from '#lib/client/optimistic.svelte';
	import {
		snoozeCustomDate,
		snoozeMinDate,
		snoozeNextWeek,
		snoozeTomorrow
	} from '#lib/client/snooze';
	import { canonicalLabel, SIZE_OPTIONS, STATUS_OPTIONS } from '#lib/labels';
	import {
		impactLabel,
		urgencyLabel,
		IMPACT_SCALE,
		URGENCY_SCALE,
		isRetiredPriorityLabel
	} from '#lib/priority';
	import { absoluteTime } from '#lib/time';

	/**
	 * One compact bar for multi-select triage (issue #30).
	 *
	 * The loaded tables own the checkboxes; this bar reads the shared durable
	 * selection. It runs the *existing* single-item writes through the bounded
	 * runner (three in flight), so partial failures keep every successful write
	 * and leave only the failed rows selected.
	 *
	 * In the mixed Inbox the issue and submission groups are separate: an
	 * issue-only action never touches a submission, and vice versa. A group
	 * with nothing selected renders disabled with its zero count.
	 */
	interface Props {
		/** `issues` on the issue streams; `inbox` for the mixed queue. */
		kind?: 'issues' | 'inbox';
		/** Whether the viewer may write; the tables hide selection otherwise. */
		mayWrite: boolean;
		/** Assignable GitHub logins for the issue group. */
		assignees?: string[];
		/** Non-reserved label names for the issue group. */
		labels?: string[];
		/** Called after a submission leaves the queue (dismiss or snooze). */
		onremove?: (key: string) => void;
		/** Page-level status region for success copy. */
		onnotice?: (message: string | null) => void;
	}

	let {
		kind = 'issues',
		mayWrite,
		assignees = [],
		labels = [],
		onremove,
		onnotice
	}: Props = $props();

	const selected = $derived(bulkSelection.snapshot());
	const issueRefs = $derived(selected.issues);
	const submissionIds = $derived(selected.submissions);
	const issueCount = $derived(issueRefs.length);
	const submissionCount = $derived(submissionIds.length);
	const count = $derived(selected.count);
	const hasIssues = $derived(issueCount > 0);
	const hasSubmissions = $derived(submissionCount > 0);

	const labelOptions = $derived(
		labels
			.filter(
				(label) => !canonicalLabel(label) && !isRetiredPriorityLabel(label)
			)
			.map((label) => ({ value: label, label }))
	);
	const assigneeOptions = $derived(
		assignees.map((login) => ({ value: login, label: login }))
	);

	let running = $state(false);
	let success = $state<string | null>(null);
	let failure = $state<{
		summary: string;
		items: { label: string; reason: string }[];
	} | null>(null);

	let assigneePick = $state<string[]>([]);
	let labelPick = $state<string[]>([]);
	let customDate = $state('');
	let customError = $state<string | null>(null);
	let dismissOpen = $state(false);
	let dismissReason = $state('');

	const minDate = $derived(snoozeMinDate());

	function issueLabel(ref: IssueSelectionRef): string {
		return `${ref.repo}#${ref.number}`;
	}

	function keyLabel(key: string): string {
		const issue = parseIssueBulkKey(key as BulkKey);
		if (issue) return issueLabel(issue);
		return key.startsWith('submission:')
			? `submission ${key.slice('submission:'.length)}`
			: key;
	}

	/** Apply one issue patch through the shared optimistic mutation path. */
	function patchIssues(
		noun: 'issue' | 'submission' | 'item',
		verb: string,
		patch: UpdateIssuePatch,
		optimistic: IssuePatch,
		failureMessage: string
	): Promise<void> {
		const tasks: BulkTask[] = issueRefs.map((ref) => ({
			key: issueBulkKey(ref.repo, ref.number),
			run: async () => {
				const outcome = await mutate({
					key: overlayKey(ref.repo, ref.number),
					patch: optimistic,
					failure: failureMessage,
					notify: false,
					commit: () => updateIssue(ref.repo, ref.number, patch)
				});
				return outcome.ok
					? { ok: true as const }
					: { ok: false as const, error: outcome.error };
			}
		}));
		return runTasks(noun, verb, tasks);
	}

	async function runTasks(
		noun: 'issue' | 'submission' | 'item',
		verb: string,
		tasks: BulkTask[]
	): Promise<void> {
		if (running || tasks.length === 0) return;
		running = true;
		success = null;
		failure = null;
		customError = null;
		onnotice?.(null);

		const result = await runBulk(tasks, { concurrency: 3 });
		running = false;

		// Successful rows leave the selection; failed rows stay selected so the
		// action can be retried against exactly the items that failed.
		bulkSelection.removeMany(result.succeeded.map((row) => row.key as BulkKey));

		if (result.failed.length === 0) {
			const suffix = result.succeeded.length === 1 ? noun : `${noun}s`;
			success = `${result.succeeded.length} ${suffix} ${verb}.`;
			onnotice?.(success);
			return;
		}

		failure = {
			summary: `${result.succeeded.length} succeeded, ${result.failed.length} failed. Successful writes were kept.`,
			items: result.failed.map((row) => ({
				label: keyLabel(row.key),
				reason: row.error ?? 'Unknown error'
			}))
		};
	}

	function setStatus(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const value = select.value;
		select.value = '';
		if (!value || !hasIssues) return;
		const status = value === 'none' ? null : value;
		void patchIssues(
			'issue',
			'updated',
			{ status },
			{ status },
			'Could not update status'
		);
	}

	function setImpact(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const value = select.value;
		select.value = '';
		if (!value || !hasIssues) return;
		const level = value === 'none' ? null : Number(value);
		const label = level === null ? null : impactLabel(level);
		void patchIssues(
			'issue',
			'updated',
			{ impact: label },
			{ impact: level },
			'Could not update impact'
		);
	}

	function setUrgency(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const value = select.value;
		select.value = '';
		if (!value || !hasIssues) return;
		const level = value === 'none' ? null : Number(value);
		const label = level === null ? null : urgencyLabel(level);
		void patchIssues(
			'issue',
			'updated',
			{ urgency: label },
			{ urgency: level },
			'Could not update urgency'
		);
	}

	function setSize(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const value = select.value;
		select.value = '';
		if (!value || !hasIssues) return;
		const size = value === 'none' ? null : value;
		void patchIssues(
			'issue',
			'updated',
			{ size },
			{ size },
			'Could not update size'
		);
	}

	function applyAssignees(logins: string[]): void {
		if (!hasIssues) return;
		const optimisticAssignees = logins.map((login) => ({
			externalId: login,
			forge: '',
			instance: '',
			login,
			avatarUrl: ''
		}));
		void patchIssues(
			'issue',
			'updated',
			{ assignees: logins },
			{ assignees: optimisticAssignees },
			'Could not update assignees'
		);
	}

	async function addLabels(): Promise<void> {
		if (!hasIssues || labelPick.length === 0) return;
		const chosen = [...labelPick];
		const tasks: BulkTask[] = issueRefs.map((ref) => ({
			key: issueBulkKey(ref.repo, ref.number),
			run: async () => {
				const result = await addIssueLabels(ref.repo, ref.number, chosen);
				return result.ok
					? { ok: true as const }
					: { ok: false as const, error: result.error };
			}
		}));
		labelPick = [];
		await runTasks('issue', 'updated', tasks);
	}

	async function snoozeSelected(until: number): Promise<void> {
		if (running || count === 0) return;
		const tasks: BulkTask[] = [];

		for (const ref of issueRefs) {
			tasks.push({
				key: issueBulkKey(ref.repo, ref.number),
				run: async () => {
					const result = await snooze(
						{ kind: 'issue', repo: ref.repo, number: ref.number },
						until
					);
					if (!result.ok) return { ok: false as const, error: result.error };
					removeSnoozedIssue(ref.repo, ref.number);
					return { ok: true as const };
				}
			});
		}

		for (const id of submissionIds) {
			tasks.push({
				key: submissionBulkKey(id),
				run: async () => {
					const result = await snooze({ kind: 'submission', id }, until);
					if (!result.ok) return { ok: false as const, error: result.error };
					removeSubmission(id);
					onremove?.(`submission:${id}`);
					return { ok: true as const };
				}
			});
		}

		await runTasks('item', 'snoozed', tasks);
	}

	function chooseCustomSnooze(): void {
		const until = snoozeCustomDate(customDate);
		if (until === null) {
			customError = 'Choose a valid date.';
			return;
		}
		customError = null;
		customDate = '';
		void snoozeSelected(until);
	}

	async function dismissSelected(): Promise<void> {
		if (!hasSubmissions || dismissReason.trim().length === 0) return;
		const reason = dismissReason.trim();
		const ids = [...submissionIds];
		const tasks: BulkTask[] = ids.map((id) => ({
			key: submissionBulkKey(id),
			run: async () => {
				const result = await dismissSubmission(id, reason);
				if (!result.ok) return { ok: false as const, error: result.error };
				removeSubmission(id);
				onremove?.(`submission:${id}`);
				return { ok: true as const };
			}
		}));
		dismissOpen = false;
		await runTasks('submission', 'dismissed', tasks);
	}

	function clear(): void {
		success = null;
		failure = null;
		onnotice?.(null);
		bulkSelection.clear();
	}
</script>

{#if mayWrite && count > 0}
	<div
		class="bulk-bar border rounded bg-body-tertiary px-2 py-2 mb-2 d-flex flex-wrap align-items-center gap-2"
		role="region"
		aria-label="Bulk actions"
	>
		<span class="small text-nowrap">
			<strong>{count}</strong>
			selected
			{#if kind === 'inbox'}
				<span class="text-body-secondary">
					({issueCount} {issueCount === 1 ? 'issue' : 'issues'} ·
					{submissionCount}
					{submissionCount === 1 ? 'submission' : 'submissions'})
				</span>
			{/if}
		</span>

		<div
			class="d-flex flex-wrap align-items-center gap-1"
			role="group"
			aria-label="Issue bulk actions"
		>
			{#if kind === 'inbox'}
				<span class="small text-body-secondary me-1">Issues {issueCount}</span>
			{/if}

			<select
				class="form-select form-select-sm w-auto"
				aria-label="Set status for selected issues"
				disabled={running || !hasIssues}
				value=""
				onchange={setStatus}
			>
				<option value="" disabled>Status…</option>
				<option value="none">No status</option>
				{#each STATUS_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>

			<select
				class="form-select form-select-sm w-auto"
				aria-label="Set impact for selected issues"
				disabled={running || !hasIssues}
				value=""
				onchange={setImpact}
			>
				<option value="" disabled>Impact…</option>
				<option value="none">Not assessed</option>
				{#each IMPACT_SCALE as level (level.value)}
					<option value={String(level.value)}>{level.value} · {level.name}</option>
				{/each}
			</select>

			<select
				class="form-select form-select-sm w-auto"
				aria-label="Set urgency for selected issues"
				disabled={running || !hasIssues}
				value=""
				onchange={setUrgency}
			>
				<option value="" disabled>Urgency…</option>
				<option value="none">Not assessed</option>
				{#each URGENCY_SCALE as level (level.value)}
					<option value={String(level.value)}>{level.value} · {level.name}</option>
				{/each}
			</select>

			<select
				class="form-select form-select-sm w-auto"
				aria-label="Set size for selected issues"
				disabled={running || !hasIssues}
				value=""
				onchange={setSize}
			>
				<option value="" disabled>Size…</option>
				<option value="none">Not estimated</option>
				{#each SIZE_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>

			{#if assigneeOptions.length > 0}
				<MultiSelect
					label="Assignee"
					ariaLabel="Choose assignees for selected issues"
					options={assigneeOptions}
					selected={assigneePick}
					onselect={(values) => (assigneePick = values)}
					disabled={running || !hasIssues}
					hideCount
					display="selection"
					placeholder="Assignee…"
				/>
				<Button
					color="outline-secondary"
					size="sm"
					disabled={running || !hasIssues || assigneePick.length === 0}
					onclick={() => applyAssignees(assigneePick)}
				>
					Set assignee
				</Button>
				<Button
					color="link"
					size="sm"
					class="text-decoration-none"
					disabled={running || !hasIssues}
					onclick={() => applyAssignees([])}
					aria-label="Unassign selected issues"
				>
					Unassign
				</Button>
			{/if}

			{#if labelOptions.length > 0}
				<MultiSelect
					label="Labels"
					ariaLabel="Choose labels to add to selected issues"
					options={labelOptions}
					selected={labelPick}
					onselect={(values) => (labelPick = values)}
					disabled={running || !hasIssues}
					hideCount
					display="selection"
					placeholder="Add labels…"
				/>
				<Button
					color="outline-secondary"
					size="sm"
					disabled={running || !hasIssues || labelPick.length === 0}
					onclick={() => void addLabels()}
				>
					Add labels
				</Button>
			{/if}
		</div>

		{#if kind === 'inbox'}
			<div
				class="d-flex flex-wrap align-items-center gap-1"
				role="group"
				aria-label="Submission bulk actions"
			>
				<span class="small text-body-secondary me-1">Submissions {submissionCount}</span>
				<Button
					color="outline-secondary"
					size="sm"
					disabled={running || !hasSubmissions}
					onclick={() => {
						dismissReason = '';
						dismissOpen = true;
					}}
				>
					Dismiss…
				</Button>
			</div>
		{/if}

		<div class="d-flex flex-wrap align-items-center gap-1 ms-auto">
			<Dropdown>
				<DropdownToggle
					color="outline-secondary"
					size="sm"
					disabled={running || count === 0}
					aria-label="Snooze selected items"
				>
					<i class="bi bi-alarm me-1" aria-hidden="true"></i>
					Snooze
				</DropdownToggle>
				<DropdownMenu end class="p-2" style="min-width: 17rem">
					<button
						type="button"
						class="dropdown-item d-flex align-items-center justify-content-between gap-3"
						onclick={() => void snoozeSelected(snoozeTomorrow())}
					>
						<span>Tomorrow</span>
						<span class="small text-body-tertiary">{absoluteTime(snoozeTomorrow())}</span>
					</button>
					<button
						type="button"
						class="dropdown-item d-flex align-items-center justify-content-between gap-3"
						onclick={() => void snoozeSelected(snoozeNextWeek())}
					>
						<span>Next week</span>
						<span class="small text-body-tertiary">{absoluteTime(snoozeNextWeek())}</span>
					</button>
					<div class="dropdown-divider"></div>
					<label class="form-label small mb-1" for="bulk-snooze-date">Custom date</label>
					<div class="d-flex align-items-center gap-2">
						<input
							id="bulk-snooze-date"
							type="date"
							class="form-control form-control-sm"
							min={minDate}
							bind:value={customDate}
						/>
						<Button
							color="primary"
							size="sm"
							disabled={running || customDate.length === 0}
							onclick={chooseCustomSnooze}
						>
							Set
						</Button>
					</div>
					{#if customError}
						<div class="small text-danger mt-1">{customError}</div>
					{/if}
				</DropdownMenu>
			</Dropdown>

			{#if running}
				<span class="d-inline-flex align-items-center gap-1 small text-body-secondary">
					<Spinner size={12} />
					Applying…
				</span>
			{/if}

			<Button
				color="link"
				size="sm"
				class="text-decoration-none"
				disabled={running}
				onclick={clear}
			>
				Clear
			</Button>
		</div>
	</div>

	{#if success}
		<Alert color="success" class="border py-2 small mb-2" role="status">
			<i class="bi bi-check-circle me-1" aria-hidden="true"></i>
			{success}
		</Alert>
	{/if}

	{#if failure}
		<Alert color="danger" class="border py-2 small mb-2">
			<div class="fw-semibold">{failure.summary}</div>
			<ul class="mb-0 mt-1" style="max-height: 10rem; overflow-y: auto">
				{#each failure.items as item (item.label)}
					<li><span class="font-monospace">{item.label}</span>: {item.reason}</li>
				{/each}
			</ul>
		</Alert>
	{/if}

	<Modal isOpen={dismissOpen} toggle={() => (dismissOpen = false)}>
		<ModalHeader toggle={() => (dismissOpen = false)}>Dismiss submissions?</ModalHeader>
		<ModalBody>
			<p>
				This archives {submissionCount}
				{submissionCount === 1 ? 'submission' : 'submissions'} with one reason.
			</p>
			<label class="form-label" for="bulk-dismiss-reason">Reason</label>
			<textarea
				id="bulk-dismiss-reason"
				name="reason"
				class="form-control"
				rows="3"
				maxlength="500"
				required
				placeholder="Why are these submissions being dismissed?"
				bind:value={dismissReason}
			></textarea>
			<div class="form-text">Required, up to 500 characters.</div>
		</ModalBody>
		<ModalFooter>
			<Button color="outline-secondary" onclick={() => (dismissOpen = false)}>
				Keep submissions
			</Button>
			<Button
				color="danger"
				disabled={running || dismissReason.trim().length === 0}
				onclick={() => void dismissSelected()}
			>
				{#if running}
					<span class="d-inline-flex align-items-center me-1"><Spinner size={12} /></span>
				{/if}
				Dismiss {submissionCount}
			</Button>
		</ModalFooter>
	</Modal>
{/if}
