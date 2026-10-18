<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import * as Bubble from '#lib/components/ui/bubble';
	import * as Message from '#lib/components/ui/message';
	import { absoluteTime, relativeTime } from '#lib/time';
	import type { RenderedComment } from '#lib/server/issues/types';

	/**
	 * The chat-style comment thread: each comment is a `Message` row with the
	 * avatar, a header carrying the author and timestamp, and the rendered
	 * Markdown inside a muted `Bubble`.
	 */
	interface Props {
		comments: RenderedComment[];
	}

	let { comments }: Props = $props();
</script>

<ul class="flex flex-col gap-4">
	{#each comments as entry (entry.githubId)}
		<li>
			<Message.Root>
				<Message.Avatar>
					<Avatar
						login={entry.author?.login ?? 'ghost'}
						avatarUrl={entry.author?.avatarUrl}
						size={32}
					/>
				</Message.Avatar>
				<Message.Content>
					<Message.Header class="gap-2">
						<strong class="text-foreground font-medium">
							{entry.author?.login ?? 'ghost'}
						</strong>
						<span title={absoluteTime(entry.createdAt)}>
							{relativeTime(entry.createdAt)}
						</span>
					</Message.Header>
					<Bubble.Root variant="muted">
						<Bubble.Content class="markdown text-sm">
							{@html entry.bodyHtml}
						</Bubble.Content>
					</Bubble.Root>
				</Message.Content>
			</Message.Root>
		</li>
	{/each}
</ul>
