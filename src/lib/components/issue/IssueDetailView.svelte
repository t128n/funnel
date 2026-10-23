<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import DetailPlaceholder from '#lib/components/shell/DetailPlaceholder.svelte';
	import InspectorPane from '#lib/components/issue/InspectorPane.svelte';
	import { clearSelection } from '#lib/client/selection.svelte';

	/**
	 * The detail column shared by the Issues, Inbox and Board routes: document
	 * head, the issue inspector, and — on the feed routes — a placeholder for a
	 * link that does not parse. Purely presentational; the route owns parsing.
	 */
	interface Props {
		issue: { repo: string; number: number } | null;
		githubUrl: string;
		/** View name appended to the page title, e.g. `Issues`. */
		titleSuffix: string;
		/** Render comments as chat bubbles instead of the compact list. */
		commentBubbles?: boolean;
		/** Fill the parent column instead of docking beside it. */
		fill?: boolean;
		/** Show the malformed-link placeholder when `issue` is null. */
		showPlaceholder?: boolean;
	}

	let {
		issue,
		githubUrl,
		titleSuffix,
		commentBubbles = false,
		fill = false,
		showPlaceholder = false
	}: Props = $props();
</script>

<PageHead title={issue ? `${issue.repo}#${issue.number} · ${titleSuffix}` : titleSuffix} />

{#if issue}
	<InspectorPane
		repo={issue.repo}
		number={issue.number}
		{githubUrl}
		onclose={clearSelection}
		{commentBubbles}
		{fill}
	/>
{:else if showPlaceholder}
	<DetailPlaceholder
		title="Issue unavailable"
		description="That issue link is malformed."
	/>
{/if}
