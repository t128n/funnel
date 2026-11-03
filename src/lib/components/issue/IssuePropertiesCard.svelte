<script lang="ts">
	import { Card, CardBody, Input } from '@sveltestrap/sveltestrap';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import MilestonePicker from '#lib/components/issue/MilestonePicker.svelte';
	import { weekHeadline } from '#lib/components/plan/format';
	import {
		planBlockMessage,
		planEligibility,
		planWeekOptions
	} from '#lib/components/plan/plan-week';
	import { SIZE_OPTIONS, STATUS_OPTIONS, canonicalLabel } from '#lib/labels';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		isRetiredPriorityLabel
	} from '#lib/priority';
	import type {
		IssueListItem,
		IssuePlanning,
		RenderedIssueDetail,
		RepoMilestoneRef
	} from '#lib/server/issues/types';

	/**
	 * Composition A's Properties card: the only metadata editor on the issue
	 * page. Every control commits immediately — there is no Save button and no
	 * unsaved state — and the page renders the outcome inline.
	 *
	 * Priority stays a derived value: the card shows the P1–P3 token the mirror
	 * derives and exposes the two orthogonal inputs (impact and urgency) that
	 * produce it. Writing a priority directly would drop one of the axes.
	 *
	 * Size is editable here as a small extension of A (production already edits
	 * it); the Details card therefore does not repeat it.
	 */
	interface Props {
		issue: IssueListItem;
		detail: RenderedIssueDetail;
		/** Exported so only the server decides who counts as a maintainer. */
		planning: IssuePlanning;
		/** Non-reserved labels currently on the issue. */
		labels: string[];
		mayWrite: boolean;
		busy: string | null;
		onstatus: (value: string) => void;
		onpriority: (axis: 'impact' | 'urgency', value: number | null) => void;
		onassignees: (logins: string[]) => void;
		onmilestone: (milestone: RepoMilestoneRef | null) => void;
		onsize: (value: string | null) => void;
		onlabels: (labels: string[]) => void;
		/** Schedule (`YYYY-MM-DD`) or clear (`null`) the issue's plan week. */
		onplan: (weekStart: string | null) => void;
	}

	let {
		issue,
		detail,
		planning,
		labels,
		mayWrite,
		busy,
		onstatus,
		onpriority,
		onassignees,
		onmilestone,
		onsize,
		onlabels,
		onplan
	}: Props = $props();

	/** Done is the closed state; the picker surfaces it beside the open stages. */
	const statusOptions = [
		...STATUS_OPTIONS,
		{ value: 'done', label: 'Done', color: 'var(--bs-success)' }
	];
	const statusValue = $derived(
		issue.state === 'closed' ? 'done' : (issue.status ?? '')
	);

	const assigneeLogins = $derived(issue.assignees.map((assignee) => assignee.login));
	const assigneeOptions = $derived(detail.assigneeOptions ?? []);

	const labelOptions = $derived(
		(detail.repoLabels ?? [])
			.filter((label) => !canonicalLabel(label.name) && !isRetiredPriorityLabel(label.name))
			.map((label) => ({ value: label.name, label: label.name, color: label.color }))
	);

	const sizeLabel = $derived(
		SIZE_OPTIONS.find((option) => option.value === issue.size)?.label ?? 'Not estimated'
	);

	const weekOptions = $derived(planWeekOptions(issue.planWeek ?? null));
	const eligibility = $derived(
		planEligibility(issue, planning.activeMaintainers ?? [])
	);
	const blockMessage = $derived(planBlockMessage(eligibility.reason));
	/** A planned-but-unowned issue may still be moved or cleared. */
	const planDisabled = $derived(
		busy === 'plan' || (!eligibility.schedulable && (issue.planWeek ?? null) === null)
	);

	function changeStatus(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (value) onstatus(value);
	}

	function changeAxis(axis: 'impact' | 'urgency', event: Event) {
		const raw = (event.currentTarget as HTMLSelectElement).value;
		onpriority(axis, raw === '' ? null : Number(raw));
	}

	function changeSize(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		onsize(value || null);
	}

	function changePlan(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value || null;
		if (value === (issue.planWeek ?? null)) return;
		onplan(value);
	}
</script>

<Card class="mb-3">
	<CardBody>
		<h2 class="h6 mb-3">Properties</h2>

		{#if mayWrite}
			<label class="form-label small" for="issue-status">Status</label>
			<Input
				id="issue-status"
				type="select"
				class="mb-3"
				value={statusValue}
				disabled={busy === 'status' || busy === 'close' || busy === 'reopen'}
				on:change={changeStatus}
			>
				<option value="" disabled>No status</option>
				{#each statusOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</Input>

			<div class="mb-3">
				<div class="d-flex align-items-baseline justify-content-between gap-2 mb-1">
					<span class="form-label small mb-0">Priority</span>
					{#if issue.priority}
						<PriorityText priority={issue.priority} showName />
					{:else}
						<span class="small text-body-secondary">No priority</span>
					{/if}
				</div>
				<p class="form-text mt-0 mb-2">Derived from impact and urgency.</p>

				<label class="form-label small" for="issue-impact">Impact</label>
				<Input
					id="issue-impact"
					type="select"
					class="mb-2"
					value={issue.impact === null ? '' : String(issue.impact)}
					disabled={busy === 'priority'}
					on:change={(event) => changeAxis('impact', event)}
				>
					<option value="">Not assessed</option>
					{#each IMPACT_SCALE as level (level.value)}
						<option value={String(level.value)}>{level.value} · {level.name}</option>
					{/each}
				</Input>

				<label class="form-label small" for="issue-urgency">Urgency</label>
				<Input
					id="issue-urgency"
					type="select"
					value={issue.urgency === null ? '' : String(issue.urgency)}
					disabled={busy === 'priority'}
					on:change={(event) => changeAxis('urgency', event)}
				>
					<option value="">Not assessed</option>
					{#each URGENCY_SCALE as level (level.value)}
						<option value={String(level.value)}>{level.value} · {level.name}</option>
					{/each}
				</Input>
			</div>

			<div class="mb-3">
				<span class="form-label small d-block">Assignee</span>
				<MultiSelect
					hideCount
					size="md"
					fullWidth
					label="Assignee"
					placeholder="Unassigned"
					display="selection"
					options={assigneeOptions.map((user) => ({ value: user.login, label: user.login }))}
					selected={assigneeLogins}
					onselect={onassignees}
					disabled={busy === 'assignees'}
				/>
			</div>

			<div class="mb-3">
				<span class="form-label small d-block">Milestone</span>
				<MilestonePicker
					repo={issue.repo}
					value={issue.milestone}
					options={detail.milestoneOptions ?? []}
					disabled={busy === 'milestone'}
					onselect={onmilestone}
				/>
			</div>

			<div class="mb-3">
				<label class="form-label small" for="issue-plan">Planned</label>
				<Input
					id="issue-plan"
					type="select"
					value={issue.planWeek ?? ''}
					disabled={planDisabled}
					on:change={changePlan}
				>
					<option value="">Not planned</option>
					{#each weekOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</Input>
				{#if blockMessage}
					<div class="form-text">{blockMessage}</div>
				{:else}
					<div class="form-text">Checks the maintainer's weekly capacity on save.</div>
				{/if}
			</div>

			<div class="mb-3">
				<label class="form-label small" for="issue-size">Size</label>
				<Input
					id="issue-size"
					type="select"
					value={issue.size ?? ''}
					disabled={busy === 'size'}
					on:change={changeSize}
				>
					<option value="">Not estimated</option>
					{#each SIZE_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</Input>
			</div>

			<div>
				<span class="form-label small d-block">Labels</span>
				<MultiSelect
					hideCount
					size="md"
					fullWidth
					label="Labels"
					placeholder="No labels"
					display="selection"
					options={labelOptions}
					selected={labels}
					onselect={onlabels}
					disabled={busy === 'labels'}
				/>
			</div>
		{:else}
			<dl class="row small mb-0">
				<dt class="col-5 fw-normal text-body-secondary">Status</dt>
				<dd class="col-7 mb-2"><StatusText status={issue.status} state={issue.state} /></dd>

				<dt class="col-5 fw-normal text-body-secondary">Priority</dt>
				<dd class="col-7 mb-2">
					{#if issue.priority}
						<PriorityText priority={issue.priority} showName />
					{:else}
						<span class="text-body-secondary">No priority</span>
					{/if}
				</dd>

				<dt class="col-5 fw-normal text-body-secondary">Assignee</dt>
				<dd class="col-7 mb-2 text-break">
					{assigneeLogins.length > 0 ? assigneeLogins.join(', ') : 'Unassigned'}
				</dd>

				<dt class="col-5 fw-normal text-body-secondary">Milestone</dt>
				<dd class="col-7 mb-2 text-break">
					{issue.milestone?.title ?? 'No milestone'}
				</dd>

				<dt class="col-5 fw-normal text-body-secondary">Planned</dt>
				<dd class="col-7 mb-2 text-break">
					{issue.planWeek
						? weekHeadline(issue.planWeek)
						: 'Not planned'}
				</dd>

				<dt class="col-5 fw-normal text-body-secondary">Size</dt>
				<dd class="col-7 mb-2">{sizeLabel}</dd>

				<dt class="col-5 fw-normal text-body-secondary">Labels</dt>
				<dd class="col-7 mb-0 text-break">
					{labels.length > 0 ? labels.join(', ') : 'No labels'}
				</dd>
			</dl>
		{/if}
	</CardBody>
</Card>
