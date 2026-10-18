<script lang="ts">
	import type { Snippet } from 'svelte';
	import InspectorPane from '#lib/components/issue/InspectorPane.svelte';
	import SubmissionDetail from '#lib/components/inbox/SubmissionDetail.svelte';
	import { clearSelection, parseSelection, selectedIssue } from '#lib/client/selection.svelte';
	import type { RenderedSubmission } from '#lib/server/issues/types';
	import IconArrowRight from '~icons/carbon/arrow-right';

	/**
	 * Master–detail split for the Inbox and Issues views (docs/DESIGN.md §Layout):
	 * a fixed-width feed column on the left and a flexible document canvas on the
	 * right. The canvas is always present; with no selection it shows an empty
	 * state instead of collapsing the column.
	 */
	interface Props {
		githubUrl: string;
		/** The staged submission selected by `?submission=`, when found (Inbox). */
		submission?: RenderedSubmission | null;
		/** Repo slugs for the submission triage forms (Inbox). */
		repos?: string[];
		defaultRepo?: string;
		/** The feed column. */
		children: Snippet;
	}

	let { githubUrl, submission = null, repos = [], defaultRepo = '', children }: Props = $props();

	const selection = $derived(parseSelection());
	const issue = $derived(selectedIssue(selection));
</script>

<div class="split" class:split--selected={selection !== null}>
	<section class="feed">{@render children()}</section>

	<aside class="detail">
		{#if issue}
			<InspectorPane
				repo={issue.repo}
				number={issue.number}
				{githubUrl}
				onclose={clearSelection}
				fill
			/>
		{:else if selection?.kind === 'submission'}
			{#if submission}
				<SubmissionDetail {submission} {repos} {defaultRepo} />
			{:else}
				<div class="detail__empty">
					<span class="detail__empty-mark">This submission is no longer staged.</span>
				</div>
			{/if}
		{:else}
			<div class="detail__empty">
				<IconArrowRight width={20} height={20} />
				<span>Select an item to view its details.</span>
			</div>
		{/if}
	</aside>
</div>

<style>
	.split {
		display: flex;
		gap: var(--island-gap);
		flex: 1;
		min-height: 0;
		min-width: 0;
		position: relative;
	}

	.feed {
		width: var(--feed-width);
		flex: none;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--color-surface-layer-1);
		border-radius: var(--island-radius);
		overflow: hidden;
	}

	.detail {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-surface-layer-1);
		border-radius: var(--island-radius);
	}

	.detail__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		height: 100%;
		padding: var(--space-xl);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		text-align: center;
	}

	.detail__empty-mark {
		color: var(--color-text-secondary);
	}

	/* Below the widescreen breakpoint the detail canvas floats over the feed
	   rather than squeezing it, matching the Inspector's classic behaviour. */
	@media (max-width: 1000px) {
		.feed {
			width: auto;
			flex: 1;
		}

		.detail {
			position: absolute;
			top: var(--island-gap);
			right: var(--island-gap);
			bottom: var(--island-gap);
			width: min(560px, calc(100% - var(--island-gap) * 2));
			z-index: 40;
			box-shadow: var(--shadow-overlay);
		}

		.split:not(.split--selected) .detail {
			display: none;
		}
	}
</style>
