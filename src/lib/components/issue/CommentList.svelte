<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import { absoluteTime, relativeTime } from '#lib/time';
	import type { RenderedComment } from '#lib/server/issues/types';

	/**
	 * The default, dense comment thread: one compact row per comment with a
	 * small avatar, author, timestamp, and rendered Markdown body.
	 */
	interface Props {
		comments: RenderedComment[];
	}

	let { comments }: Props = $props();
</script>

<ul class="flex flex-col gap-3">
	{#each comments as entry (entry.githubId)}
		<li class="flex gap-2">
			<Avatar
				login={entry.author?.login ?? 'ghost'}
				avatarUrl={entry.author?.avatarUrl}
				size={20}
			/>
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<div class="flex items-baseline gap-2 text-xs">
					<strong class="font-medium">{entry.author?.login ?? 'ghost'}</strong>
					<span class="text-muted-foreground" title={absoluteTime(entry.createdAt)}>
						{relativeTime(entry.createdAt)}
					</span>
				</div>
				<div class="markdown text-foreground text-sm">{@html entry.bodyHtml}</div>
			</div>
		</li>
	{/each}
</ul>
