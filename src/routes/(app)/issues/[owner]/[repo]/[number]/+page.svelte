<script lang="ts">
	import IssueDetailPage from '#lib/components/issue/IssueDetailPage.svelte';
	import { parseIssueParams } from '#lib/issue-url';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	// The server guard rejected malformed links with a 404; a syntactically
	// valid link is always renderable here and the page owns the fetch states.
	const issue = $derived(parseIssueParams(params));
</script>

<main class="container-lg py-4" aria-label="Issue">
	{#if issue}
		<IssueDetailPage
			repo={issue.repo}
			number={issue.number}
			githubUrl={data.githubUrl}
			commentBubbles={data.commentBubbles}
		/>
	{/if}
</main>
