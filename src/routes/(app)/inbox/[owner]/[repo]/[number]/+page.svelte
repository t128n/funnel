<script lang="ts">
	import IssueDetailView from '#lib/components/issue/IssueDetailView.svelte';
	import { parseIssueParams } from '#lib/issue-url';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	const issue = $derived(parseIssueParams(params));
</script>

<IssueDetailView
	{issue}
	githubUrl={data.githubUrl}
	commentBubbles={data.commentBubbles}
	titleSuffix="Inbox"
	fill
	showPlaceholder
/>
