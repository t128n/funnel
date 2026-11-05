<script lang="ts">
	import { Badge, Card, CardBody } from '@sveltestrap/sveltestrap';
	import { issuePath } from '#lib/issue-url';
	import type { IssueRelationRef, IssueRelations } from '#lib/server/issues/types';

	/**
	 * Inspector relationships card (issue #34). It renders the parent/sub-issue
	 * and blocked-by/blocking edges GitHub reports, with progress computed from
	 * the mirrored child edges. The card is read-only: relationships are managed
	 * on GitHub. It hides itself when nothing was found, so it never implies
	 * dependency support on a host that returned none.
	 */
	interface Props {
		relations: IssueRelations;
	}

	let { relations }: Props = $props();

	const hasAny = $derived(
		relations.parent !== null ||
			relations.children.length > 0 ||
			relations.blockedBy.length > 0 ||
			relations.blocking.length > 0
	);

	function stateLabel(state: string): string {
		return state === 'closed' ? 'Closed' : 'Open';
	}
</script>

{#snippet relationItem(ref: IssueRelationRef)}
	<li class="d-flex align-items-start justify-content-between gap-2">
		<a
			href={issuePath('issues', ref.repo, ref.number)}
			class="min-w-0 text-primary text-decoration-none"
			title={`${ref.repo}#${ref.number} · ${ref.title || 'Untitled issue'}`}
		>
			<span class="font-monospace">#{ref.number}</span>
			<span class="text-break"> {ref.title || 'Untitled issue'}</span>
			<span class="d-block small text-body-secondary text-break">{ref.repo}</span>
		</a>
		<Badge
			color={ref.state === 'closed' ? 'secondary' : 'light'}
			class="flex-shrink-0 border fw-normal text-body-secondary"
		>
			{stateLabel(ref.state)}
		</Badge>
	</li>
{/snippet}

{#if hasAny}
	<Card id="issue-relations" class="mb-3">
		<CardBody>
			<h2 class="h6 mb-3">Relationships</h2>

			{#if relations.parent}
				<div class="mb-3">
					<div class="form-label small mb-1">Parent</div>
					<ul class="list-unstyled mb-0">
						{@render relationItem(relations.parent)}
					</ul>
				</div>
			{/if}

			{#if relations.children.length > 0 && relations.progress}
				<div class="mb-3">
					<div class="d-flex align-items-baseline justify-content-between gap-2 mb-1">
						<span class="form-label small mb-0">Sub-issues</span>
						<span class="small text-body-secondary metric-number">
							{relations.progress.completed}/{relations.progress.total}
						</span>
					</div>
					<div
						class="progress mb-2"
						role="progressbar"
						aria-label="Sub-issue progress"
						aria-valuenow={relations.progress.percent}
						aria-valuemin="0"
						aria-valuemax="100"
						style="height: 6px"
					>
						<div
							class="progress-bar"
							style={`width: ${relations.progress.percent}%`}
						></div>
					</div>
					<ul class="list-unstyled mb-0 d-flex flex-column gap-2">
						{#each relations.children as child (`${child.repo}#${child.number}`)}
							{@render relationItem(child)}
						{/each}
					</ul>
				</div>
			{/if}

			{#if relations.blockedBy.length > 0}
				<div class="mb-3">
					<div class="form-label small mb-1">
						<i class="bi bi-diagram-3 me-1" aria-hidden="true"></i>Blocked by
					</div>
					<p class="small text-body-secondary mb-1">
						GitHub dependency, separate from Funnel's manual blocked flag.
					</p>
					<ul class="list-unstyled mb-0 d-flex flex-column gap-2">
						{#each relations.blockedBy as blocker (`${blocker.repo}#${blocker.number}`)}
							{@render relationItem(blocker)}
						{/each}
					</ul>
				</div>
			{/if}

			{#if relations.blocking.length > 0}
				<div>
					<div class="form-label small mb-1">
						<i class="bi bi-diagram-3 me-1" aria-hidden="true"></i>Blocking
					</div>
					<p class="small text-body-secondary mb-1">
						GitHub dependency, separate from Funnel's manual blocked flag.
					</p>
					<ul class="list-unstyled mb-0 d-flex flex-column gap-2">
						{#each relations.blocking as target (`${target.repo}#${target.number}`)}
							{@render relationItem(target)}
						{/each}
					</ul>
				</div>
			{/if}
		</CardBody>
	</Card>
{/if}

<style>
	.metric-number {
		font-variant-numeric: tabular-nums;
	}
</style>
