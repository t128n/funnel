<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import Breadcrumbs from '#lib/components/shell/Breadcrumbs.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import { Button } from '@sveltestrap/sveltestrap';
	import type { PageProps } from './$types';

	const DAY_MS = 86_400_000;

	let { data }: PageProps = $props();

	const metrics = $derived(data.insights);
	const range = $derived(metrics.range);
	const selectedRepo = $derived(data.repo ?? '');
	const maxThroughput = $derived(
		Math.max(
			1,
			...metrics.throughput.days.map((day) => Math.max(day.decisions, day.closed))
		)
	);
	const maxBacklog = $derived(
		Math.max(1, ...metrics.backlog.buckets.map((bucket) => bucket.count))
	);
	const throughputEmpty = $derived(
		metrics.throughput.totalDecisions === 0 && metrics.throughput.totalClosed === 0
	);
	const isEmpty = $derived(
		metrics.inbox.count === 0 &&
			metrics.firstTriage.count === 0 &&
			metrics.timeToClose.count === 0 &&
			metrics.wip.total === 0 &&
			metrics.stale.count === 0 &&
			metrics.backlog.total === 0 &&
			throughputEmpty
	);

	/** Compact elapsed time: minutes under an hour, hours under a day, days above. */
	function formatAge(ms: number | null): string {
		if (ms === null || !Number.isFinite(ms)) return '—';
		if (ms < DAY_MS) {
			if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
			const hours = ms / 3_600_000;
			return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
		}
		const days = ms / DAY_MS;
		return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
	}

	function barHeight(value: number): string {
		return `${Math.round((value / maxThroughput) * 100)}%`;
	}

	function backlogWidth(value: number): string {
		return `${Math.round((value / maxBacklog) * 100)}%`;
	}

	function dayLabel(date: string): string {
		return date.slice(5);
	}
</script>

<PageHead
	title="Insights"
	description="Triage flow, throughput and backlog age for the selected repository and date range."
/>

<main class="container-xl py-4">
	<Breadcrumbs items={[{ label: 'Workspace', href: '/issues' }, { label: 'Insights' }]} />

	<PageHeader
		title="Insights"
		count={`${range.from} → ${range.to}`}
		description="Snapshot metrics describe the database now; flow metrics cover the UTC calendar range. Range metrics apply no business-day adjustment."
	/>

	<Toolbar>
		<form method="get" class="d-flex flex-wrap align-items-end gap-2">
			<div>
				<label for="insights-repo" class="form-label small mb-1">Repository</label>
				<select id="insights-repo" name="repo" class="form-select form-select-sm">
					<option value="">All repos</option>
					{#each data.repos as repo (repo)}
						<option value={repo} selected={repo === selectedRepo}>{repo}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="insights-from" class="form-label small mb-1">From</label>
				<input
					id="insights-from"
					name="from"
					type="date"
					class="form-control form-control-sm"
					value={range.from}
				/>
			</div>
			<div>
				<label for="insights-to" class="form-label small mb-1">To</label>
				<input
					id="insights-to"
					name="to"
					type="date"
					class="form-control form-control-sm"
					value={range.to}
				/>
			</div>
			<Button type="submit" color="primary" size="sm">Apply</Button>
			<Button color="outline-secondary" size="sm" href="/insights">Reset</Button>
		</form>
	</Toolbar>

	{#if range.fallback}
		<InlineStatus
			class="mb-3"
			tone="warning"
			message={`Invalid or reversed date range; showing ${range.from} to ${range.to}.`}
		/>
	{/if}

	{#if !data.repoKnown}
		<InlineStatus
			class="mb-3"
			tone="info"
			message={`No configured repository matches “${data.repo}”. Showing empty metrics.`}
		/>
	{/if}

	{#if isEmpty}
		<div class="border rounded bg-body-tertiary mb-4">
			<EmptyState
				title="No activity in this range."
				description="Adjust the repository or date range. Empty metrics are valid: every count is zero and every median is shown as an em dash."
			/>
		</div>
	{/if}

	<section aria-labelledby="insights-snapshot" class="mb-4">
		<div class="d-flex align-items-baseline gap-2 mb-2">
			<h2 id="insights-snapshot" class="h6 mb-0">Snapshot</h2>
			<span class="badge text-bg-secondary">now</span>
		</div>

		<div class="row row-cols-1 row-cols-sm-2 row-cols-xl-3 g-3">
			<div class="col">
				<div class="card h-100">
					<div class="card-body">
						<h3 class="h6 mb-1">Inbox age</h3>
						<p class="fs-3 mb-1 tabular">{formatAge(metrics.inbox.medianMs)}</p>
						<p class="small text-body-secondary mb-1">
							median · p90 {formatAge(metrics.inbox.p90Ms)}
						</p>
						<p class="small mb-0">
							{metrics.inbox.count} pending · oldest
							{metrics.inbox.oldestDays === null ? '—' : `${metrics.inbox.oldestDays}d`}
						</p>
					</div>
				</div>
			</div>
			<div class="col">
				<div class="card h-100">
					<div class="card-body">
						<h3 class="h6 mb-1">Work in progress</h3>
						<p class="fs-3 mb-1 tabular">{metrics.wip.total}</p>
						<p class="small text-body-secondary mb-1">open issues</p>
						<p class="small mb-0">
							in progress {metrics.wip.byStatus['in-progress']} · in review
							{metrics.wip.byStatus['in-review']}
						</p>
					</div>
				</div>
			</div>
			<div class="col">
				<div class="card h-100">
					<div class="card-body">
						<h3 class="h6 mb-1">Stale waiting</h3>
						<p class="fs-3 mb-1 tabular">{metrics.stale.count}</p>
						<p class="small text-body-secondary mb-1">
							waiting more than {metrics.stale.thresholdDays} days
						</p>
						<p class="small mb-0">Open issues only</p>
					</div>
				</div>
			</div>
		</div>

		<div class="card mt-3">
			<div class="card-body">
				<h3 class="h6 mb-1">Backlog aging</h3>
				<p class="small text-body-secondary mb-3">
					Open backlog, todo and unset issues by age since creation.
				</p>
				{#if metrics.backlog.total === 0}
					<p class="small text-body-secondary mb-0">No unstarted open issues.</p>
				{:else}
					<div class="d-flex flex-column gap-2" role="img" aria-label="Backlog age distribution">
						{#each metrics.backlog.buckets as bucket (bucket.key)}
							<div class="d-flex align-items-center gap-2">
								<span class="small text-body-secondary backlog-label">{bucket.label}</span>
								<div class="backlog-track flex-grow-1" aria-hidden="true">
									<div class="backlog-fill" style:width={backlogWidth(bucket.count)}></div>
								</div>
								<span class="small tabular backlog-count">{bucket.count}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>

	<section aria-labelledby="insights-range" class="mb-4">
		<div class="d-flex align-items-baseline gap-2 mb-2">
			<h2 id="insights-range" class="h6 mb-0">Flow</h2>
			<span class="badge text-bg-secondary">range</span>
		</div>

		<div class="row row-cols-1 row-cols-sm-2 g-3">
			<div class="col">
				<div class="card h-100">
					<div class="card-body">
						<h3 class="h6 mb-1">Time to first triage</h3>
						<p class="fs-3 mb-1 tabular">{formatAge(metrics.firstTriage.medianMs)}</p>
						<p class="small text-body-secondary mb-1">
							median · p90 {formatAge(metrics.firstTriage.p90Ms)}
						</p>
						<p class="small mb-0">{metrics.firstTriage.count} submissions</p>
					</div>
				</div>
			</div>
			<div class="col">
				<div class="card h-100">
					<div class="card-body">
						<h3 class="h6 mb-1">Time to close</h3>
						<p class="fs-3 mb-1 tabular">{formatAge(metrics.timeToClose.medianMs)}</p>
						<p class="small text-body-secondary mb-1">
							median · p90 {formatAge(metrics.timeToClose.p90Ms)}
						</p>
						<p class="small mb-0">{metrics.timeToClose.count} issues</p>
					</div>
				</div>
			</div>
		</div>

		<div class="card mt-3">
			<div class="card-body">
				<h3 class="h6 mb-1">Throughput</h3>
				<p class="small text-body-secondary mb-3">
					Daily counts. Decisions: {metrics.throughput.totalDecisions}; issues closed:
					{metrics.throughput.totalClosed}.
				</p>
				{#if throughputEmpty}
					<p class="small text-body-secondary mb-0">No decisions or closes in this range.</p>
				{:else}
					<div class="d-flex flex-wrap gap-3 small text-body-secondary mb-2">
						<span><span class="legend-swatch legend-decisions"></span> Decisions</span>
						<span><span class="legend-swatch legend-closed"></span> Issues closed</span>
					</div>
					<div class="throughput-scroll">
						<div
							class="throughput-chart"
							role="img"
							aria-label={`Daily triage decisions and closed issues from ${range.from} to ${range.to}`}
						>
							{#each metrics.throughput.days as day (day.date)}
								<div class="throughput-day" title={`${day.date}: ${day.decisions} decisions, ${day.closed} closed`}>
									<div class="throughput-bars" aria-hidden="true">
										<div
											class="throughput-bar throughput-bar--decisions"
											style:height={barHeight(day.decisions)}
										></div>
										<div
											class="throughput-bar throughput-bar--closed"
											style:height={barHeight(day.closed)}
										></div>
									</div>
									<span class="throughput-label" aria-hidden="true">{dayLabel(day.date)}</span>
								</div>
							{/each}
						</div>
					</div>
					<table class="visually-hidden">
						<caption>Daily triage decisions and issues closed</caption>
						<thead>
							<tr><th scope="col">Date</th><th scope="col">Decisions</th><th scope="col">Closed</th></tr>
						</thead>
						<tbody>
							{#each metrics.throughput.days as day (day.date)}
								<tr>
									<th scope="row">{day.date}</th>
									<td>{day.decisions}</td>
									<td>{day.closed}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	</section>
</main>

<style>
	.tabular {
		font-variant-numeric: tabular-nums;
	}

	.backlog-label {
		width: 5.5rem;
		flex-shrink: 0;
	}

	.backlog-count {
		width: 2rem;
		text-align: right;
		flex-shrink: 0;
	}

	.backlog-track {
		background: var(--bs-tertiary-bg);
		border: 1px solid var(--bs-border-color);
		border-radius: 0.25rem;
		height: 0.75rem;
		overflow: hidden;
	}

	.backlog-fill {
		height: 100%;
		background: var(--bs-primary);
		min-width: 0;
	}

	.legend-swatch {
		display: inline-block;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 0.125rem;
		margin-right: 0.25rem;
		vertical-align: -0.1em;
	}

	.legend-decisions,
	.throughput-bar--decisions {
		background: var(--bs-primary);
	}

	.legend-closed,
	.throughput-bar--closed {
		background: var(--bs-success);
	}

	.throughput-scroll {
		overflow-x: auto;
	}

	.throughput-chart {
		display: flex;
		align-items: flex-end;
		gap: 0.25rem;
		min-width: max-content;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--bs-border-color);
	}

	.throughput-day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		width: 1.6rem;
		flex-shrink: 0;
	}

	.throughput-bars {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 0.125rem;
		height: 8rem;
		width: 100%;
	}

	.throughput-bar {
		width: 0.55rem;
		min-height: 0;
		border-radius: 0.125rem 0.125rem 0 0;
	}

	.throughput-label {
		font-size: 0.65rem;
		color: var(--bs-secondary-color);
		white-space: nowrap;
	}
</style>
