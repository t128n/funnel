<script lang="ts">
	import type { Snippet } from 'svelte';
	import InspectorPane from '#lib/components/issue/InspectorPane.svelte';
	import SubmissionDetail from '#lib/components/inbox/SubmissionDetail.svelte';
	import * as Empty from '#lib/components/ui/empty';
	import { clearSelection, parseSelection, selectedIssue } from '#lib/client/selection.svelte';
	import type { RenderedSubmission } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	/**
	 * Master–detail split for the Inbox and Issues views: a fixed-width feed
	 * column on the left and a flexible document canvas on the right. The canvas
	 * is always present; with no selection it shows an empty state instead of
	 * collapsing the column.
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

<div class="relative flex min-h-0 min-w-0 flex-1">
	<section
		class={cn(
			'flex w-90 shrink-0 flex-col overflow-hidden border-r',
			selection !== null && 'max-[1000px]:w-auto max-[1000px]:flex-1'
		)}
	>
		{@render children()}
	</section>

	<!-- Below the widescreen breakpoint the detail canvas floats over the feed
	     rather than squeezing it. -->
	<aside
		class={cn(
			'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
			'max-[1000px]:bg-background max-[1000px]:absolute max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:z-40 max-[1000px]:w-[min(560px,100%)] max-[1000px]:border-l max-[1000px]:shadow-lg',
			selection === null && 'max-[1000px]:hidden'
		)}
	>
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
				<Empty.Root class="h-full">
					<Empty.Header>
						<Empty.Title>Submission unavailable</Empty.Title>
						<Empty.Description>This submission is no longer staged.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		{:else}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<ArrowRightIcon />
					</Empty.Media>
					<Empty.Title>Nothing selected</Empty.Title>
					<Empty.Description>Select an item to view its details.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</aside>
</div>
