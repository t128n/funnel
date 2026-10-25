<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import * as Empty from '#lib/components/ui/empty';
	import { Button } from '#lib/components/ui/button';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { markNotificationsRead } from '#lib/client/mutations';
	import { enableNativeNotifications, NATIVE_NOTIFICATIONS_KEY } from '#lib/client/native-notifications';
	import { notifyFailure } from '#lib/client/optimistic.svelte';
	import type {
		NotificationItem,
		NotificationKind
	} from '#lib/server/notifications/types';
	import { absoluteTime } from '#lib/time';
	import { cn } from '#lib/utils';
	import BellRingIcon from '@lucide/svelte/icons/bell-ring';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import type { PageProps } from './$types';

	/**
	 * Notification center (SPEC §3.3). Unread rows lead, read rows follow, and
	 * each row carries the actor, the issue/intake link, and a relative time.
	 * Marking one or all read persists server-side and re-runs both this load and
	 * the shared layout, so the sidebar badge cannot drift from the list.
	 */
	let { data }: PageProps = $props();

	const KIND_LABEL: Record<NotificationKind, string> = {
		assigned: 'Assigned',
		mentioned: 'Mentioned',
		comment: 'Comment',
		status: 'Status',
		priority: 'Priority',
		state: 'State',
		new_intake: 'New intake'
	};

	const unread = $derived(data.items.filter((item) => item.readAt === null));
	const read = $derived(data.items.filter((item) => item.readAt !== null));
	const unreadCount = $derived(data.unreadCount);

	/** The id being marked (or `all`) so every control shares one busy state. */
	let busy = $state<string | null>(null);
	type NativeState = 'unknown' | 'requesting' | 'granted' | 'denied' | 'unsupported';
	let nativeState = $state<NativeState>('unknown');

	onMount(() => {
		if (typeof Notification === 'undefined') {
			nativeState = 'unsupported';
			return;
		}
		if (Notification.permission === 'denied') {
			nativeState = 'denied';
			return;
		}
		let optedIn = false;
		try {
			optedIn = window.localStorage.getItem(NATIVE_NOTIFICATIONS_KEY) === 'true';
		} catch {
			// Storage blocked: the helper still works for this tab.
		}
		nativeState = Notification.permission === 'granted' && optedIn ? 'granted' : 'unknown';
	});

	async function markRead(id: string) {
		if (busy !== null) return;
		busy = id;
		const result = await markNotificationsRead({ id });
		busy = null;
		if (!result.ok) {
			notifyFailure('Could not mark notification read', result.error);
			return;
		}
		await invalidateAll();
	}

	async function markAllRead() {
		if (busy !== null || unreadCount === 0) return;
		busy = 'all';
		const result = await markNotificationsRead({ all: true });
		busy = null;
		if (!result.ok) {
			notifyFailure('Could not mark notifications read', result.error);
			return;
		}
		await invalidateAll();
	}

	/**
	 * Follow a row. An unread row is marked read first so the badge is correct
	 * even if the destination's layout is reused. Modified clicks keep the
	 * browser's own new-tab behaviour and skip the write.
	 */
	async function openItem(item: NotificationItem, event: MouseEvent) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (item.readAt !== null) return;

		event.preventDefault();
		const result = await markNotificationsRead({ id: item.id });
		if (!result.ok) notifyFailure('Could not mark notification read', result.error);
		await invalidateAll();
		await goto(item.url);
	}

	/** A compact destination label: `owner/name#7` for issues, a name for intake. */
	function targetLabel(url: string): string {
		const issue = /^\/issues\/([^/]+)\/([^/]+)\/(\d+)$/.exec(url);
		if (issue) return `${issue[1]}/${issue[2]}#${issue[3]}`;
		if (url.startsWith('/inbox/submission/')) return 'Intake submission';
		return url;
	}

	async function requestNative() {
		if (nativeState !== 'unknown') return;
		nativeState = 'requesting';
		try {
			nativeState = await enableNativeNotifications();
		} catch (error) {
			nativeState = 'unsupported';
			notifyFailure('Could not enable browser notifications', (error as Error).message);
		}
	}

	const nativeCopy = $derived.by(() => {
		switch (nativeState) {
			case 'granted':
				return 'Browser notifications are on while this tab stays open.';
			case 'denied':
				return 'Notifications are blocked in your browser settings.';
			case 'unsupported':
				return 'This browser does not support native notifications.';
			case 'requesting':
				return 'Waiting for browser permission…';
			default:
				return 'Get a native notification for new events while a Funnel tab is open.';
		}
	});
</script>

<PageHead
	title="Notifications"
	description="Assignments, mentions, watched-issue changes, and new intake submissions."
/>

<div class="surface-shell bg-[var(--background)] flex min-h-0 min-w-0 flex-1 flex-col">
	<header
		class="border-[color:var(--border)] flex h-11 shrink-0 items-center gap-2 border-b px-3"
	>
		<h1 class="text-base font-semibold tracking-tight">Notifications</h1>
		{#if unreadCount > 0}
			<span class="mono text-muted-foreground text-xs">{unreadCount} unread</span>
		{/if}
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<Button
				variant="outline"
				size="sm"
				disabled={unreadCount === 0 || busy !== null}
				onclick={() => void markAllRead()}
			>
				{#if busy === 'all'}
					<Spinner size={13} />
				{:else}
					<CheckCheckIcon class="size-3.5" />
				{/if}
				Mark all read
			</Button>
		</div>
	</header>

	{#if data.nativeNotifications}
		<div
			class="border-[color:var(--border)] bg-[var(--muted)] flex shrink-0 items-center gap-2 border-b px-3 py-2"
		>
			<BellRingIcon class="text-muted-foreground size-3.5 shrink-0" />
			<p class="text-muted-foreground min-w-0 flex-1 text-xs">{nativeCopy}</p>
			{#if nativeState === 'unknown'}
				<Button variant="outline" size="xs" onclick={() => void requestNative()}>
					Enable
				</Button>
			{:else if nativeState === 'requesting'}
				<Spinner size={12} label="Requesting permission" />
			{/if}
		</div>
	{:else}
		<div
			class="border-[color:var(--border)] flex shrink-0 items-center gap-2 border-b px-3 py-2"
		>
			<BellRingIcon class="text-muted-foreground size-3.5 shrink-0" />
			<p class="text-muted-foreground text-xs">
				Browser notifications are turned off in settings. In-app notifications still appear here.
			</p>
		</div>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if data.items.length === 0}
			<Empty.Root class="border-0">
				<Empty.Media>
					<BellRingIcon class="text-muted-foreground size-8" />
				</Empty.Media>
				<Empty.Title>You're all caught up</Empty.Title>
				<Empty.Description>
					Assignments, mentions, watched-issue changes, and new intake submissions show up
					here.
				</Empty.Description>
			</Empty.Root>
		{:else}
			{#each [{ key: 'unread', label: 'Unread', items: unread }, { key: 'read', label: 'Read', items: read }] as group (group.key)}
				{#if group.items.length > 0}
					<section aria-label={group.label}>
						<div
							class="bg-[var(--background)] sticky top-0 z-20 flex items-center gap-1.5 border-b border-[color:var(--border)] px-3 py-1.5"
						>
							<h2 class="text-xs font-semibold">{group.label}</h2>
							<span class="text-muted-foreground/50 text-xs" aria-hidden="true">·</span>
							<span class="mono text-muted-foreground text-xs">{group.items.length}</span>
						</div>
						<ul class="divide-y divide-[color:var(--border)]" role="list">
							{#each group.items as item (item.id)}
								<li
									class={cn(
										'group/row flex items-start gap-3 px-3 py-3 transition-colors hover:bg-[var(--accent)]',
										item.readAt !== null && 'opacity-65'
									)}
								>
									<span
										class={cn(
											'mt-2 size-2 shrink-0 rounded-full',
											item.readAt === null
												? 'bg-[var(--primary)]'
												: 'bg-transparent'
										)}
										aria-hidden="true"
									></span>

									{#if item.actorLogin}
										<Avatar
											login={item.actorLogin}
											avatarUrl={item.actorAvatarUrl}
											size={24}
										/>
									{:else}
										<span
											class="bg-[var(--muted)] text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded"
										>
											<BellRingIcon class="size-3.5" />
										</span>
									{/if}

									<div class="min-w-0 flex-1">
										<div class="flex min-w-0 items-baseline gap-2">
											<a
												href={item.url}
												class="text-foreground hover:underline min-w-0 truncate text-sm font-medium"
												onclick={(event) => void openItem(item, event)}
											>
												{item.title || KIND_LABEL[item.kind]}
											</a>
											<span class="text-muted-foreground shrink-0 text-[11px]">
												{KIND_LABEL[item.kind]}
											</span>
											<time
												class="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums"
												datetime={new Date(item.createdAt).toISOString()}
												title={absoluteTime(item.createdAt)}
											>
												{timeAgo(item.createdAt)}
											</time>
										</div>

										<div class="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
											{#if item.actorLogin}
												<span class="truncate font-medium">{item.actorLogin}</span>
												<span aria-hidden="true">·</span>
											{/if}
											<span class="truncate">{targetLabel(item.url)}</span>
										</div>

										{#if item.body}
											<p class="text-muted-foreground mt-1 line-clamp-2 text-xs">
												{item.body}
											</p>
										{/if}
									</div>

									{#if item.readAt === null}
										<Button
											variant="ghost"
											size="xs"
											class="shrink-0"
											disabled={busy !== null}
											aria-label={`Mark ${item.title || KIND_LABEL[item.kind]} read`}
											onclick={() => void markRead(item.id)}
										>
											{#if busy === item.id}
												<Spinner size={12} />
											{:else}
												Mark read
											{/if}
										</Button>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		{/if}
	</div>
</div>
