<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PlanLanes from '#lib/components/plan/PlanLanes.svelte';
	import { weekHeadline } from '#lib/components/plan/format';
	import { unscheduleRequest } from '#lib/components/plan/schedule';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import type { WeekPlan } from '#lib/server/planning/plans';
	import { canWrite } from '#lib/roles';

	/**
	 * One week's capacity. Scheduling lives on the issue's Properties panel;
	 * this page only shows the committed work and lets a writer remove an issue
	 * from the plan.
	 */
	interface PlanData {
		week?: string;
		previous?: string | null;
		next?: string | null;
		weekPlan?: WeekPlan | null;
		allocationPercent?: number;
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
	const allocationPercent = $derived(data.allocationPercent ?? 60);
	const sizeMinutes = $derived(data.sizeMinutes ?? {});
	const isCurrent = $derived(week === data.today);
	const previousHref = $derived(data.previous ? `/plan?week=${data.previous}` : null);
	const nextHref = $derived(data.next ? `/plan?week=${data.next}` : null);

	function issueKey(issue: PlanningIssue): string {
		return `${issue.repo}#${issue.number}`;
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

<PageHead
	title={`${weekHeadline(week)} · Plan`}
	description="Committed work against each maintainer's weekly capacity."
/>

<main class="container-fluid px-3 px-lg-4 py-4">
	<PageHeader title={weekHeadline(week)}>
		{#snippet actions()}
			<Button color="link" size="sm" href="/day" class="text-decoration-none">
				My day
			</Button>
		{/snippet}
	</PageHeader>

	<nav
		class="d-flex flex-wrap align-items-center gap-1 border-bottom pb-2 mb-3"
		aria-label="Week navigation"
	>
		{#if previousHref}
			<Button
				color="link"
				size="sm"
				href={previousHref}
				class="text-body-secondary text-decoration-none px-1"
				aria-label="Previous week"
				title="Previous week"
			>
				<i class="bi bi-chevron-left" aria-hidden="true"></i>
			</Button>
		{:else}
			<Button
				color="link"
				size="sm"
				disabled
				class="text-body-secondary text-decoration-none px-1"
				aria-label="Previous week"
			>
				<i class="bi bi-chevron-left" aria-hidden="true"></i>
			</Button>
		{/if}

		{#if !isCurrent}
			<a class="link-primary px-2 small" href="/plan">Today</a>
		{/if}

		{#if nextHref}
			<Button
				color="link"
				size="sm"
				href={nextHref}
				class="text-body-secondary text-decoration-none px-1"
				aria-label="Next week"
				title="Next week"
			>
				<i class="bi bi-chevron-right" aria-hidden="true"></i>
			</Button>
		{:else}
			<Button
				color="link"
				size="sm"
				disabled
				class="text-body-secondary text-decoration-none px-1"
				aria-label="Next week"
			>
				<i class="bi bi-chevron-right" aria-hidden="true"></i>
			</Button>
		{/if}

		<span class="ms-auto small text-body-secondary">
			Set <span class="fw-semibold">Planned</span> on an issue to commit it to a week.
		</span>
	</nav>

	<div class="d-flex flex-column gap-3">
		{#if removeError}
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
		{/if}

		{#if data.weekPlan}
			<PlanLanes
				lanes={data.weekPlan.lanes}
				unassigned={data.weekPlan.unassigned}
				unestimated={data.weekPlan.unestimated}
				{allocationPercent}
				{sizeMinutes}
				{mayWrite}
				onremove={remove}
				{removing}
			/>
		{:else}
			<EmptyState
				title="No week loaded."
				description="Choose a week from the navigation above."
				class="border-top border-bottom py-4"
			/>
		{/if}
	</div>
</main>
