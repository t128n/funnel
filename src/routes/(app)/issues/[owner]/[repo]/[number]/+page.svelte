<script lang="ts">
	import InspectorPane from '#lib/components/issue/InspectorPane.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import DetailPlaceholder from '#lib/components/shell/DetailPlaceholder.svelte';
	import { clearSelection } from '#lib/client/selection.svelte';
	import { parseIssueParams } from '#lib/issue-url';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	const issue = $derived(parseIssueParams(params));
</script>

<PageHead title={issue ? `${issue.repo}#${issue.number} · Issues` : 'Issues'} />

{#if issue}
	<InspectorPane
		repo={issue.repo}
		number={issue.number}
		githubUrl={data.githubUrl}
		onclose={clearSelection}
		commentBubbles={data.commentBubbles}
		fill
	/>
{:else}
	<DetailPlaceholder
		title="Issue unavailable"
		description="That issue link is malformed."
	/>
{/if}
