<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { markNotificationsRead } from '#lib/client/mutations';
	import { enableNativeNotifications, NATIVE_NOTIFICATIONS_KEY } from '#lib/client/native-notifications';
	import type { NotificationItem, NotificationKind } from '#lib/server/notifications/types';
	import { absoluteTime } from '#lib/time';
	import { cn } from '#lib/utils';
	import AtSignIcon from '@lucide/svelte/icons/at-sign';
	import BellRingIcon from '@lucide/svelte/icons/bell-ring';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import CircleDotIcon from '@lucide/svelte/icons/circle-dot';
	import FlagIcon from '@lucide/svelte/icons/flag';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UserRoundPlusIcon from '@lucide/svelte/icons/user-round-plus';
	import type { PageProps } from './$types';

	/**
	 * Notification center (SPEC §3.3). Unread rows lead, read rows follow, in
	 * ruled lists rather than cards. Each row carries its kind as icon + word,
	 * the actor, the target link, and a relative time with the absolute value in
	 * `title`. Unread is a dot, 600 weight, and an sr-only "Unread" — never a
	 * coloured fill. Marking one or all read persists server-side and re-runs
	 * both this load and the shared layout, so the sidebar badge cannot drift.
	 */
	let { data }: PageProps = $props();

	const KIND_META: Record<NotificationKind, { label: string; icon: Component }> = {
		assigned: { label: 'Assigned', icon: UserRoundPlusIcon },
		mentioned: { label: 'Mentioned', icon: AtSignIcon },
		comment: { label: 'Comment', icon: MessageSquareIcon },
		status: { label: 'Status', icon: CircleDotIcon },
		priority: { label: 'Priority', icon: FlagIcon },
		state: { label: 'State', icon: RefreshCwIcon },
		new_intake: { label: 'New intake', icon: InboxIcon }
	};

	const unread = $derived(data.items.filter((item) => item.readAt === null));
	const read = $derived(data.items.filter((item) => item.readAt !== null));
	const unreadCount = $derived(data.unreadCount);
	const groups = $derived([
		{ key: 'unread', label: 'Unread', items: unread },
		{ key: 'read', label: 'Read', items: read }
	]);

	/** The id being marked (or `all`) so every control shares one busy state. */
	let busy = $state<string | null>(null);
	type Retry = { kind: 'one'; id: string } | { kind: 'all' } | null;
	let error = $state<string | null>(null);
	let retryAction = $state<Retry>(null);

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

	function report(message: string, retry: Retry) {
		error = message;
		retryAction = retry;
	}

	async function markRead(id: string) {
		if (busy !== null) return;
		busy = id;
		const result = await markNotificationsRead({ id });
		busy = null;
		if (!result.ok) {
			report(`Could not mark the notification read. ${result.error}`, { kind: 'one', id });
			return;
		}
		error = null;
		retryAction = null;
		await invalidateAll();
	}

	async function markAllRead() {
		if (busy !== null || unreadCount === 0) return;
		busy = 'all';
		const result = await markNotificationsRead({ all: true });
		busy = null;
		if (!result.ok) {
			report(`Could not mark notifications read. ${result.error}`, { kind: 'all' });
			return;
		}
		error = null;
		retryAction = null;
		await invalidateAll();
	}

	function retry() {
		if (retryAction === null) return;
		if (retryAction.kind === 'all') void markAllRead();
		else void markRead(retryAction.id);
	}

	/**
	 * Follow a row. An unread row is marked read first so the badge is correct
	 * even if the destination's layout is reused. Modified clicks keep the
	 * browser's own new-tab behaviour and skip the write.
	 */
	async function openItem(item: NotificationItem, event: MouseEvent) {
		if (
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}
		if (item.readAt !== null) return;

		event.preventDefault();
		const result = await markNotificationsRead({ id: item.id });
		if (!result.ok) {
			report(`Could not mark the notification read. ${result.error}`, {
				kind: 'one',
				id: item.id
			});
		}
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
		} catch (nativeError) {
			nativeState = 'unsupported';
			report(
				`Could not enable browser notifications. ${(nativeError as Error).message}`,
				null
			);
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

<div class="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
	<PageHeader
		title="Notifications"
		count={unreadCount > 0 ? `${unreadCount} unread` : undefined}
	>
		{#snippet actions()}
			<Button
				variant="outline"
				size="sm"
				disabled={unreadCount === 0 || busy !== null}
				onclick={() => void markAllRead()}
			>
				{#if busy === 'all'}
					<Spinner size={13} label="Marking all read" />
				{:else}
					<CheckCheckIcon class="size-4" aria-hidden="true" />
				{/if}
				Mark all read
			</Button>
		{/snippet}
	</PageHeader>

	{#if data.nativeNotifications}
		<div
			class="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-subtle bg-surface px-(--layout-page-padding) py-2"
		>
			<BellRingIcon class="size-4 shrink-0 text-fg-secondary" aria-hidden="true" />
			<p class="min-w-0 flex-1 text-body text-fg-secondary">{nativeCopy}</p>
			{#if nativeState === 'unknown'}
				<Button variant="outline" size="sm" onclick={() => void requestNative()}>
					Enable browser notifications
				</Button>
			{:else if nativeState === 'requesting'}
				<Spinner size={13} label="Requesting permission" />
			{/if}
		</div>
	{:else}
		<div
			class="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-(--layout-page-padding) py-2"
		>
			<BellRingIcon class="size-4 shrink-0 text-fg-secondary" aria-hidden="true" />
			<p class="text-body text-fg-secondary">
				Browser notifications are off. In-app notifications still appear here.
			</p>
		</div>
	{/if}

	{#if error}
		<div class="border-b border-border-subtle px-(--layout-page-padding) py-2">
			<InlineStatus tone="error" message={error}>
				{#snippet action()}
					<Button variant="link" size="sm" onclick={retry} disabled={busy !== null}>
						Retry
					</Button>
				{/snippet}
			</InlineStatus>
		</div>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if data.items.length === 0}
			<EmptyState
				title="You're all caught up."
				description="Assignments, mentions, status changes, and new intake submissions appear here."
			>
				{#snippet action()}
					<Button variant="outline" size="sm" href="/issues">View issues</Button>
				{/snippet}
			</EmptyState>
		{:else}
			{#each groups as group (group.key)}
				{#if group.items.length > 0}
					<section aria-labelledby={`notifications-${group.key}`}>
						<div
							class="sticky top-0 z-10 flex h-8 items-center gap-2 border-b border-border-subtle bg-canvas px-(--layout-page-padding)"
						>
							<h2
								id={`notifications-${group.key}`}
								class="text-caption font-semibold text-fg-secondary"
							>
								{group.label}
							</h2>
							<span class="text-caption text-fg-muted tabular-nums">
								{group.items.length}
							</span>
						</div>
						<ul>
							{#each group.items as item (item.id)}
								{@const meta = KIND_META[item.kind]}
								{@const KindIcon = meta.icon}
								{@const isUnread = item.readAt === null}
								<li
									class="group/row flex items-start gap-3 border-b border-border-subtle px-3 py-2 hover:bg-surface-2"
								>
									<span class="flex w-4 shrink-0 justify-center pt-1.5">
										{#if isUnread}
											<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
											<span class="sr-only">Unread</span>
										{/if}
									</span>

									<div class="min-w-0 flex-1">
										<div class="flex min-w-0 items-baseline gap-2">
											<a
												href={item.url}
												class={cn(
													'min-w-0 truncate text-body text-fg hover:underline',
													isUnread && 'font-semibold'
												)}
												onclick={(event) => void openItem(item, event)}
											>
												{item.title || meta.label}
											</a>
											<time
												class="ml-auto shrink-0 text-caption text-fg-secondary tabular-nums"
												datetime={new Date(item.createdAt).toISOString()}
												title={absoluteTime(item.createdAt)}
											>
												{timeAgo(item.createdAt)}
											</time>
										</div>

										<div
											class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-fg-secondary"
										>
											<span class="inline-flex shrink-0 items-center gap-1">
												<KindIcon class="size-3.5" aria-hidden="true" />
												{meta.label}
											</span>
											{#if item.actorLogin}
												<span aria-hidden="true">·</span>
												<span class="truncate" title={item.actorLogin}>{item.actorLogin}</span>
											{/if}
											<span aria-hidden="true">·</span>
											<a
												href={item.url}
												class="link min-w-0 truncate"
												onclick={(event) => void openItem(item, event)}
											>
												{targetLabel(item.url)}
											</a>
										</div>

										{#if item.body}
											<p class="mt-1 line-clamp-2 text-caption text-fg-secondary">
												{item.body}
											</p>
										{/if}
									</div>

									{#if isUnread}
										<Button
											variant="ghost"
											size="sm"
											class="shrink-0"
											disabled={busy !== null}
											aria-label={`Mark ${item.title || meta.label} read`}
											onclick={() => void markRead(item.id)}
										>
											{#if busy === item.id}
												<Spinner size={12} label="Marking read" />
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
