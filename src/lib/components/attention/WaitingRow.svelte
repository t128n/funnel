<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '@sveltestrap/sveltestrap';
	import RefText from '#lib/components/common/RefText.svelte';
	import { recheckDateLabel, recheckLabel, toISODate } from '#lib/attention';
	import { clearWaiting } from '#lib/client/mutations';
	import { issuePath } from '#lib/issue-url';
	import { issueRef } from '#lib/issue-ref';
	import type { WaitingAttentionItem } from '#lib/server/issues/types';
	import { waitingReasonLabel, WAITING_STALE_DAYS } from '#lib/waiting';

	/**
	 * One waiting issue on the Attention page. Waiting has its own section,
	 * separate from the blocked re-check groups, because nothing is in flight:
	 * the issue is parked until the other party responds. Stale rows carry an
	 * explicit badge and an emphasised left edge so they stand out without
	 * relying on colour alone. Clearing is one click and immediate.
	 */
	interface Props {
		item: WaitingAttentionItem;
		/** `owner/name` -> project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** Only writers can clear the local waiting state. */
		mayWrite: boolean;
	}

	let { item, repoShortcodes = {}, mayWrite }: Props = $props();

	const issue = $derived(item.issue);
	const href = $derived(issuePath('issues', issue.repo, issue.number));
	const ref = $derived(issueRef(issue.repo, issue.number, repoShortcodes));
	const since = $derived(toISODate(new Date(item.waitingSince)));
	const recheck = $derived(item.recheckOn ?? '');

	let clearing = $state(false);
	let error = $state<string | null>(null);

	async function clear() {
		if (clearing) return;
		clearing = true;
		error = null;
		const result = await clearWaiting(issue.repo, issue.number);
		clearing = false;
		if (!result.ok) {
			error = result.error;
			return;
		}
		await invalidateAll();
	}
</script>

<div
	role="listitem"
	class="waiting-row position-relative d-flex align-items-center gap-3 border-bottom px-3 py-2"
	class:stale={item.stale}
>
	<!-- Stretched link: the whole row opens the issue; controls layer above it. -->
	<a
		{href}
		class="waiting-row__link"
		aria-label={`Open ${issue.repo}#${issue.number}: ${issue.title}`}
	></a>

	<div class="d-flex min-w-0 flex-grow-1 flex-column gap-1 py-1">
		<div class="d-flex min-w-0 flex-wrap align-items-center gap-2">
			<span class="d-inline-flex align-items-center gap-1 small text-nowrap flex-shrink-0 text-body-secondary">
				<i class="bi bi-hourglass-split" aria-hidden="true"></i>
				<span>{waitingReasonLabel(item.reason)}</span>
			</span>

			{#if item.stale}
				<span class="badge text-bg-warning flex-shrink-0" title={`Waiting ${item.days} days — past the ${WAITING_STALE_DAYS}-day stale threshold`}>
					Stale · {item.days}d
				</span>
			{/if}

			<span class="flex-shrink-0 link-primary"><RefText value={ref} title={`${issue.repo}#${issue.number}`} class="text-reset" /></span>

			<span class="min-w-0 flex-grow-1 text-truncate small text-body" title={issue.title}>
				{issue.title}
			</span>
		</div>

		<div class="d-flex min-w-0 flex-wrap align-items-center gap-2 small text-body-secondary">
			<span class="min-w-0 flex-grow-1 text-truncate" title={item.note ?? ''}>
				{item.note || 'No note'}
			</span>
			<time datetime={since} class="flex-shrink-0 tabular" title="Waiting since">
				Waiting since {recheckDateLabel(since)}
			</time>
			{#if recheck}
				<time datetime={recheck} class="flex-shrink-0 tabular" title="Re-check date">
					· Re-check {recheckDateLabel(recheck)} ({recheckLabel(recheck, toISODate(new Date()))})
				</time>
			{:else}
				<span class="flex-shrink-0">· No re-check date</span>
			{/if}
		</div>

		{#if error}
			<p class="small text-danger mb-0" role="alert">{error}</p>
		{/if}
	</div>

	{#if mayWrite}
		<div class="position-relative z-1 d-flex flex-shrink-0 align-items-center">
			<Button
				color="outline-secondary"
				size="sm"
				disabled={clearing}
				title="Stop waiting"
				onclick={() => void clear()}
			>
				<i class="bi bi-check2-circle me-1" aria-hidden="true"></i>
				{clearing ? 'Clearing…' : 'Clear waiting'}
			</Button>
		</div>
	{/if}
</div>

<style>
	.waiting-row__link {
		position: absolute;
		inset: 0;
		outline: none;
	}

	.waiting-row__link:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: -2px;
	}

	.waiting-row.stale {
		border-left: 3px solid var(--bs-warning);
	}

	.tabular {
		font-variant-numeric: tabular-nums;
	}
</style>
