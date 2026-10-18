<script lang="ts">
	import InspectorPane from '#lib/components/issue/InspectorPane.svelte';
	import { clearSelection } from '#lib/client/selection.svelte';
	import { parseIssueParams } from '#lib/issue-url';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	const issue = $derived(parseIssueParams(params));
</script>

{#if issue}
	<InspectorPane
		repo={issue.repo}
		number={issue.number}
		githubUrl={data.githubUrl}
		onclose={clearSelection}
		commentBubbles={data.commentBubbles}
	/>
{/if}
