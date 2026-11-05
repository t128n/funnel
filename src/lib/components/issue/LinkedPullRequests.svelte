<script lang="ts">
	import { Badge, Card, CardBody } from '@sveltestrap/sveltestrap';
	import { timeAgo } from '#lib/client/clock.svelte';
	import {
		pullRequestChecksLabel,
		pullRequestReviewLabel,
		pullRequestStateLabel,
		pullRequestStateTone
	} from '#lib/components/issue/pull-request-format';
	import type { LinkedPullRequest } from '#lib/server/issues/types';

	/**
	 * Inspector "Development" card: the pull requests GitHub links to this
	 * issue, with state, review decision, and the head commit's check rollup.
	 * Links leave for GitHub; Funnel never writes to a pull request.
	 */
	interface Props {
		pullRequests: LinkedPullRequest[];
	}

	let { pullRequests }: Props = $props();

	function checksTone(state: string | undefined): string {
		if (state === 'failure') return 'danger';
		if (state === 'pending') return 'warning';
		if (state === 'success') return 'success';
		return 'secondary';
	}
</script>

<Card id="issue-pull-requests" class="mb-3">
	<CardBody>
		<div class="d-flex align-items-baseline justify-content-between gap-2 mb-3">
			<h2 class="h6 mb-0">Pull requests</h2>
			<span class="small text-body-secondary metric-number">{pullRequests.length}</span>
		</div>

		{#if pullRequests.length === 0}
			<p class="small text-body-secondary mb-0">
				No pull requests are linked to this issue. Closing keywords and manually
				linked pull requests appear after the next sync.
			</p>
		{:else}
			<ul class="list-unstyled mb-0 d-flex flex-column gap-3">
				{#each pullRequests as pr (pr.number)}
					{@const state = pullRequestStateLabel(pr)}
					{@const review = pullRequestReviewLabel(pr.reviewDecision)}
					{@const checks = pullRequestChecksLabel(pr.checks)}
					<li>
						<div class="d-flex align-items-start justify-content-between gap-2">
							<div class="min-w-0">
								<a
									href={pr.url || undefined}
									class="text-primary text-decoration-none text-break fw-medium"
									target="_blank"
									rel="noreferrer"
								>
									<span class="font-monospace">#{pr.number}</span>
									{pr.title || 'Untitled pull request'}
								</a>
								<div class="small text-body-secondary text-break">
									{#if pr.author}
										{pr.author.login}
										<span aria-hidden="true">·</span>
									{/if}
									updated {timeAgo(pr.updatedAt)}
								</div>
							</div>
							<Badge color={pullRequestStateTone(pr)} class="flex-shrink-0">{state}</Badge>
						</div>

						<div class="d-flex flex-wrap align-items-center gap-2 mt-1 small">
							{#if review}
								<span
									class={pr.reviewDecision === 'changes_requested'
										? 'text-danger'
										: pr.reviewDecision === 'approved'
											? 'text-success'
											: 'text-body-secondary'}
								>
									{review}
									{#if pr.changesRequestedCount > 0}
										<span class="text-body-secondary">({pr.changesRequestedCount})</span>
									{:else if pr.approvedCount > 0}
										<span class="text-body-secondary">({pr.approvedCount})</span>
									{/if}
								</span>
							{:else}
								<span class="text-body-secondary">No reviews</span>
							{/if}

							{#if checks && pr.checks}
								{#if pr.checks.url}
									<a
										href={pr.checks.url}
										class="text-decoration-none"
										target="_blank"
										rel="noreferrer"
									>
										<Badge color={checksTone(pr.checks.state)} class="fw-normal">{checks}</Badge>
									</a>
								{:else}
									<Badge color={checksTone(pr.checks.state)} class="fw-normal">{checks}</Badge>
								{/if}
							{:else}
								<span class="text-body-secondary">No checks</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</CardBody>
</Card>
