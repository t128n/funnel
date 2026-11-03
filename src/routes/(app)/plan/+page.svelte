<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Table } from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { weekHeadline } from '#lib/components/plan/format';
	import { unscheduleRequest } from '#lib/components/plan/schedule';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import { canWrite } from '#lib/roles';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import type { WeekPlan } from '#lib/server/planning/plans';

	/**
	 * One week's capacity as three ordinary tables: maintainer capacity, the
	 * issues committed to the week, and the open issues that still need a size.
	 * Scheduling lives on the issue's Properties panel; this page only shows the
	 * committed work and lets a writer remove an issue from the plan.
	 */
	interface PlanData {
		week?: string;
		previous?: string | null;
		next?: string | null;
		weekPlan?: WeekPlan | null;
		sizeMinutes?: Record<string, number>;
		today?: string | null;
		user?: { role?: unknown } | null;
	}

	let { data }: { data: PlanData } = $props();

	let removing = $state<string | null>(null);
	let removeError = $state<string | null>(null);
	let failedRemove = $state<PlanningIssue | null>(null);

	const week = $derived(data.week ?? data.weekPlan?.weekStart ?? '');
	const mayWrite = $derived(canWrite(data.user?.role));
	const sizeMinutes = $derived(data.sizeMinutes ?? {});
	const isCurrent = $derived(week === data.today);
	const previousHref = $derived(data.previous ? `/plan?week=${data.previous}` : null);
	const nextHref = $derived(data.next ? `/plan?week=${data.next}` : null);

	const lanes = $derived(data.weekPlan?.lanes ?? []);
	const unassigned = $derived(data.weekPlan?.unassigned.issues ?? []);
	const unestimated = $derived(data.weekPlan?.unestimated ?? []);

	// An issue appears in every maintainer lane it is distributed across; the
	// scheduled table lists it once.
	const scheduled = $derived.by(() => {
		const seen = new Set<string>();
		const issues: PlanningIssue[] = [];
		for (const lane of lanes) {
			for (const issue of lane.issues) {
				const key = issueKey(issue);
				if (seen.has(key)) continue;
				seen.add(key);
				issues.push(issue);
			}
		}
		return issues;
	});

	const hasPlannedWork = $derived(scheduled.length + unassigned.length > 0);

	function issueKey(issue: PlanningIssue): string {
		return `${issue.repo}#${issue.number}`;
	}

	function sizeLabel(size: string | null): string {
		if (size === null) return '—';
		if (size === 'sm') return 'S';
		if (size === 'md') return 'M';
		if (size === 'lg') return 'L';
		return size.toUpperCase();
	}

	function estimateLabel(issue: PlanningIssue): string {
		if (issue.size === null) return '—';
		const minutes = sizeMinutes[issue.size] ?? sizeMinutes[issue.size.toLowerCase()];
		return minutes === undefined ? '—' : formatMinutes(minutes);
	}

	function assigneesOf(issue: PlanningIssue): string {
		return issue.assignees.map((person) => person.login).join(', ');
	}

	/** Keep the sign on an over-cap remainder; `formatMinutes` clamps at zero. */
	function signedMinutes(minutes: number): string {
		return minutes < 0 ? `-${formatMinutes(Math.abs(minutes))}` : formatMinutes(minutes);
	}

	async function remove(issue: PlanningIssue) {
		const key = issueKey(issue);
		removing = key;
		removeError = null;
		failedRemove = null;
		try {
			const request = unscheduleRequest(issue.repo, issue.number);
			const response = await fetch(request.url, { method: request.method });
			if (!response.ok) {
				removeError = `Could not remove ${key} from the plan (${response.status}).`;
				failedRemove = issue;
				return;
			}
			await invalidateAll();
		} catch {
			removeError = `Could not remove ${key} from the plan. Check your connection.`;
			failedRemove = issue;
		} finally {
			removing = null;
		}
	}
</script>

{#snippet issueRow(issue: PlanningIssue)}
	<tr>
		<td class="font-monospace small text-body-secondary text-nowrap d-none d-md-table-cell">
			{issueKey(issue)}
		</td>
		<td>
			<a
				href={issuePath('issues', issue.repo, issue.number)}
				class="text-primary text-decoration-none text-break"
			>
				{issue.title.trim() || 'Untitled'}
			</a>
			<div class="small text-body-secondary d-md-none mt-1 text-break">
				<span class="font-monospace">{issueKey(issue)}</span>
				<span class="mx-1" aria-hidden="true">·</span>
				<span>{sizeLabel(issue.size)}</span>
				<span class="mx-1" aria-hidden="true">·</span>
				<span>{estimateLabel(issue)}</span>
				<span class="mx-1" aria-hidden="true">·</span>
				<span>{assigneesOf(issue) || '—'}</span>
			</div>
		</td>
		<td class="small text-break d-none d-md-table-cell">{assigneesOf(issue) || '—'}</td>
		<td class="small text-end text-nowrap d-none d-md-table-cell">{sizeLabel(issue.size)}</td>
		<td class="font-monospace small text-end text-nowrap d-none d-md-table-cell">
			{estimateLabel(issue)}
		</td>
		{#if mayWrite}
			<td class="text-end text-nowrap">
				<Button
					color="link"
					size="sm"
					class="text-decoration-none"
					disabled={removing === issueKey(issue)}
					aria-label={`Remove ${issueKey(issue)} from the plan`}
					onclick={() => void remove(issue)}
				>
					Remove
				</Button>
			</td>
		{/if}
	</tr>
{/snippet}

<PageHead
	title={`${weekHeadline(week)} · Plan`}
	description="Committed work against each maintainer's weekly capacity."
/>

<main class="container-xl py-4">
	<PageHeader title={`Plan — ${weekHeadline(week)}`}>
		{#snippet actions()}
			{#if previousHref}
				<Button color="outline-secondary" size="sm" href={previousHref}>Previous week</Button>
			{:else}
				<Button color="outline-secondary" size="sm" disabled>Previous week</Button>
			{/if}
			{#if nextHref}
				<Button color="outline-secondary" size="sm" href={nextHref}>Next week</Button>
			{:else}
				<Button color="outline-secondary" size="sm" disabled>Next week</Button>
			{/if}
			{#if !isCurrent}
				<Button color="outline-secondary" size="sm" href="/plan">This week</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if removeError}
		<div class="mb-3">
			<InlineStatus tone="error" message={removeError}>
				{#snippet action()}
					<Button
						color="link"
						size="sm"
						disabled={removing !== null || failedRemove === null}
						onclick={() => failedRemove && void remove(failedRemove)}
					>
						Retry
					</Button>
				{/snippet}
			</InlineStatus>
		</div>
	{/if}

	{#if data.weekPlan}
		<section class="mb-4">
			<h2 class="h5 mb-2">Capacity</h2>
			{#if lanes.length > 0}
				<div class="table-responsive border rounded">
					<Table hover class="align-middle mb-0">
						<thead class="table-light">
							<tr>
								<th scope="col" class="small text-body-secondary">Assignee</th>
								<th scope="col" class="small text-body-secondary text-end d-none d-md-table-cell">
									Net capacity
								</th>
								<th scope="col" class="small text-body-secondary text-end">Planning capacity</th>
								<th scope="col" class="small text-body-secondary text-end">Scheduled</th>
								<th scope="col" class="small text-body-secondary text-end">Available</th>
							</tr>
						</thead>
						<tbody>
							{#each lanes as lane (lane.maintainer.externalId)}
								<tr>
									<td class="text-nowrap">
										{lane.maintainer.login}
										<div class="small text-body-secondary d-md-none">
											Net {formatMinutes(lane.maintainer.weeklyMinutes)}
										</div>
									</td>
									<td class="font-monospace text-end text-nowrap d-none d-md-table-cell">
										{formatMinutes(lane.maintainer.weeklyMinutes)}
									</td>
									<td class="font-monospace text-end text-nowrap">
										{formatMinutes(lane.capMinutes)}
									</td>
									<td class="font-monospace text-end text-nowrap">
										{formatMinutes(lane.committedMinutes)}
									</td>
									<td
										class="font-monospace text-end text-nowrap {lane.over ||
										lane.remainingMinutes < 0
											? 'text-danger'
											: ''}"
									>
										{#if lane.over || lane.remainingMinutes < 0}
											<span class="visually-hidden">Over capacity: </span>
										{/if}
										{signedMinutes(lane.remainingMinutes)}
									</td>
								</tr>
							{/each}
						</tbody>
					</Table>
				</div>
			{:else}
				<p class="border rounded px-3 py-2 text-body-secondary mb-0">
					No capacity lanes. Add active maintainers in Planning settings to open capacity lanes.
				</p>
			{/if}
		</section>

		{#if !hasPlannedWork}
			<p class="border rounded px-3 py-2 text-body-secondary mb-4">
				Nothing is planned for this week. Open an issue and set
				<span class="fw-semibold">Planned</span> in its Properties panel to commit it to the
				week.
			</p>
		{:else}
			<section class="mb-4">
				<h2 class="h5 mb-2">Scheduled issues</h2>
				{#if scheduled.length > 0}
					<div class="table-responsive border rounded" data-testid="plan-table">
						<Table hover class="align-middle mb-0">
							<thead class="table-light">
								<tr>
									<th
										scope="col"
										class="small text-body-secondary d-none d-md-table-cell"
										style="width: 7rem;"
									>
										Issue
									</th>
									<th scope="col" class="small text-body-secondary">Title</th>
									<th
										scope="col"
										class="small text-body-secondary d-none d-md-table-cell"
										style="width: 8rem;"
									>
										Assignee
									</th>
									<th
										scope="col"
										class="small text-body-secondary text-end d-none d-md-table-cell"
										style="width: 4rem;"
									>
										Size
									</th>
									<th
										scope="col"
										class="small text-body-secondary text-end d-none d-md-table-cell"
										style="width: 5rem;"
									>
										Hours
									</th>
									{#if mayWrite}
										<th scope="col" class="small text-body-secondary text-end" style="width: 5rem;">
											Actions
										</th>
									{/if}
								</tr>
							</thead>
							<tbody>
								{#each scheduled as issue (issueKey(issue))}
									{@render issueRow(issue)}
								{/each}
							</tbody>
						</Table>
					</div>
				{:else}
					<p class="border rounded px-3 py-2 text-body-secondary mb-0">
						Nothing is scheduled to a maintainer this week.
					</p>
				{/if}
			</section>

			{#if unassigned.length > 0}
				<section class="mb-4">
					<h2 class="h5 mb-2">Unassigned issues</h2>
					<div class="table-responsive border rounded">
						<Table hover class="align-middle mb-0">
							<thead class="table-light">
								<tr>
									<th
										scope="col"
										class="small text-body-secondary d-none d-md-table-cell"
										style="width: 7rem;"
									>
										Issue
									</th>
									<th scope="col" class="small text-body-secondary">Title</th>
									<th
										scope="col"
										class="small text-body-secondary d-none d-md-table-cell"
										style="width: 8rem;"
									>
										Assignee
									</th>
									<th
										scope="col"
										class="small text-body-secondary text-end d-none d-md-table-cell"
										style="width: 4rem;"
									>
										Size
									</th>
									<th
										scope="col"
										class="small text-body-secondary text-end d-none d-md-table-cell"
										style="width: 5rem;"
									>
										Hours
									</th>
									{#if mayWrite}
										<th scope="col" class="small text-body-secondary text-end" style="width: 5rem;">
											Actions
										</th>
									{/if}
								</tr>
							</thead>
							<tbody>
								{#each unassigned as issue (issueKey(issue))}
									{@render issueRow(issue)}
								{/each}
							</tbody>
						</Table>
					</div>
				</section>
			{/if}
		{/if}

		{#if unestimated.length > 0}
			<section class="mb-4">
				<h2 class="h5 mb-2">Unestimated issues</h2>
				<div class="table-responsive border rounded">
					<Table hover class="align-middle mb-0">
						<thead class="table-light">
							<tr>
								<th
									scope="col"
									class="small text-body-secondary d-none d-md-table-cell"
									style="width: 7rem;"
								>
									Issue
								</th>
								<th scope="col" class="small text-body-secondary">Title</th>
								<th
									scope="col"
									class="small text-body-secondary d-none d-md-table-cell"
									style="width: 8rem;"
								>
									Assignee
								</th>
								<th scope="col" class="small text-body-secondary text-end" style="width: 5rem;">
									Action
								</th>
							</tr>
						</thead>
						<tbody>
							{#each unestimated as issue (issueKey(issue))}
								<tr>
									<td
										class="font-monospace small text-body-secondary text-nowrap d-none d-md-table-cell"
									>
										{issueKey(issue)}
									</td>
									<td>
										<a
											href={issuePath('issues', issue.repo, issue.number)}
											class="text-primary text-decoration-none text-break"
										>
											{issue.title.trim() || 'Untitled'}
										</a>
										<div class="small text-body-secondary d-md-none mt-1 text-break">
											<span class="font-monospace">{issueKey(issue)}</span>
											<span class="mx-1" aria-hidden="true">·</span>
											<span>{assigneesOf(issue) || '—'}</span>
										</div>
									</td>
									<td class="small text-break d-none d-md-table-cell">{assigneesOf(issue) || '—'}</td>
									<td class="text-end text-nowrap">
										<Button
											color="link"
											size="sm"
											href={issuePath('issues', issue.repo, issue.number)}
											class="text-decoration-none"
											aria-label={`Estimate ${issueKey(issue)}`}
										>
											Estimate
										</Button>
									</td>
								</tr>
							{/each}
						</tbody>
					</Table>
				</div>
			</section>
		{/if}
	{:else}
		<p class="border rounded px-3 py-2 text-body-secondary mb-0">
			No week loaded. Choose a week from the navigation above.
		</p>
	{/if}
</main>
