<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { markNotificationsRead } from '#lib/client/mutations';
	import { enableNativeNotifications, NATIVE_NOTIFICATIONS_KEY } from '#lib/client/native-notifications';
	import type { NotificationItem, NotificationKind } from '#lib/server/notifications/types';
	import { absoluteTime } from '#lib/time';
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

	const KIND_META: Record<NotificationKind, { label: string; icon: string }> = {
		assigned: { label: 'Assigned', icon: 'bi-person-plus' },
		mentioned: { label: 'Mentioned', icon: 'bi-at' },
		comment: { label: 'Comment', icon: 'bi-chat-left-text' },
		status: { label: 'Status', icon: 'bi-record-circle' },
		priority: { label: 'Priority', icon: 'bi-flag' },
		state: { label: 'State', icon: 'bi-arrow-clockwise' },
		new_intake: { label: 'New intake', icon: 'bi-inbox' }
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

<div class="d-flex min-h-0 min-w-0 flex-grow-1 flex-column bg-body">
	<PageHeader
		title="Notifications"
		count={unreadCount > 0 ? `${unreadCount} unread` : undefined}
	>
		{#snippet actions()}
			<Button
				color="outline-secondary"
				size="sm"
				disabled={unreadCount === 0 || busy !== null}
				onclick={() => void markAllRead()}
			>
				{#if busy === 'all'}
					<span class="d-inline-flex align-items-center me-1">
						<Spinner size={13} label="Marking all read" />
					</span>
				{:else}
					<i class="bi bi-check2-all me-1" aria-hidden="true"></i>
				{/if}
				Mark all read
			</Button>
		{/snippet}
	</PageHeader>

	{#if data.nativeNotifications}
		<div
			class="d-flex flex-shrink-0 flex-wrap align-items-center gap-3 border-bottom bg-body-tertiary px-3 py-2"
		>
			<i class="bi bi-bell fs-6 flex-shrink-0 text-body-secondary" aria-hidden="true"></i>
			<p class="min-w-0 flex-grow-1 text-body-secondary mb-0">{nativeCopy}</p>
			{#if nativeState === 'unknown'}
				<Button color="outline-secondary" size="sm" onclick={() => void requestNative()}>
					Enable browser notifications
				</Button>
			{:else if nativeState === 'requesting'}
				<Spinner size={13} label="Requesting permission" />
			{/if}
		</div>
	{:else}
		<div
			class="d-flex flex-shrink-0 align-items-center gap-3 border-bottom bg-body-tertiary px-3 py-2"
		>
			<i class="bi bi-bell fs-6 flex-shrink-0 text-body-secondary" aria-hidden="true"></i>
			<p class="text-body-secondary mb-0">
				Browser notifications are off. In-app notifications still appear here.
			</p>
		</div>
	{/if}

	{#if error}
		<div class="border-bottom px-3 py-2">
			<InlineStatus tone="error" message={error}>
				{#snippet action()}
					<Button color="link" size="sm" onclick={retry} disabled={busy !== null}>
						Retry
					</Button>
				{/snippet}
			</InlineStatus>
		</div>
	{/if}

	<div class="min-h-0 flex-grow-1 overflow-y-auto">
		{#if data.items.length === 0}
			<EmptyState
				title="You're all caught up."
				description="Assignments, mentions, status changes, and new intake submissions appear here."
			>
				{#snippet action()}
					<Button color="outline-secondary" size="sm" href="/issues">View issues</Button>
				{/snippet}
			</EmptyState>
		{:else}
			{#each groups as group (group.key)}
				{#if group.items.length > 0}
					<section aria-labelledby={`notifications-${group.key}`}>
						<div
							class="sticky-top d-flex align-items-center gap-2 border-bottom bg-body px-3 py-1"
						>
							<h2
								id={`notifications-${group.key}`}
								class="small fw-semibold text-body-secondary mb-0"
							>
								{group.label}
							</h2>
							<span class="small text-body-tertiary tabular">
								{group.items.length}
							</span>
						</div>
						<ul class="list-unstyled mb-0">
							{#each group.items as item (item.id)}
								{@const meta = KIND_META[item.kind]}
								{@const isUnread = item.readAt === null}
								<li
									class="notification-row d-flex align-items-start gap-3 border-bottom px-3 py-2"
								>
									<span
										class="d-flex flex-shrink-0 justify-content-center pt-2"
										style="width: 1rem"
									>
										{#if isUnread}
											<span
												class="unread-dot d-inline-block flex-shrink-0 rounded-circle bg-primary"
												aria-hidden="true"
											></span>
											<span class="visually-hidden">Unread</span>
										{/if}
									</span>

									<div class="min-w-0 flex-grow-1">
										<div class="d-flex min-w-0 align-items-baseline gap-2">
											<a
												href={item.url}
												class="notification-title min-w-0 text-truncate text-body {isUnread
													? 'fw-semibold'
													: ''}"
												onclick={(event) => void openItem(item, event)}
											>
												{item.title || meta.label}
											</a>
											<time
												class="ms-auto flex-shrink-0 small text-body-secondary tabular"
												datetime={new Date(item.createdAt).toISOString()}
												title={absoluteTime(item.createdAt)}
											>
												{timeAgo(item.createdAt)}
											</time>
										</div>

										<div
											class="mt-1 d-flex min-w-0 flex-wrap align-items-center gap-1 small text-body-secondary"
										>
											<span class="d-inline-flex flex-shrink-0 align-items-center gap-1">
												<i class="bi {meta.icon}" aria-hidden="true"></i>
												{meta.label}
											</span>
											{#if item.actorLogin}
												<span aria-hidden="true">·</span>
												<span class="text-truncate" title={item.actorLogin}>
													{item.actorLogin}
												</span>
											{/if}
											<span aria-hidden="true">·</span>
											<a
												href={item.url}
												class="link-primary min-w-0 text-truncate"
												onclick={(event) => void openItem(item, event)}
											>
												{targetLabel(item.url)}
											</a>
										</div>

										{#if item.body}
											<p class="notification-snippet mt-1 small text-body-secondary mb-0">
												{item.body}
											</p>
										{/if}
									</div>

									{#if isUnread}
										<Button
											color="link"
											size="sm"
											class="flex-shrink-0 text-decoration-none"
											disabled={busy !== null}
											aria-label={`Mark ${item.title || meta.label} read`}
											onclick={() => void markRead(item.id)}
										>
											{#if busy === item.id}
												<span class="d-inline-flex align-items-center me-1">
													<Spinner size={12} label="Marking read" />
												</span>
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

<style>
	.notification-row:hover {
		background: var(--bs-tertiary-bg);
	}

	.notification-title {
		text-decoration: none;
	}

	.notification-title:hover {
		text-decoration: underline;
	}

	.unread-dot {
		width: 0.5rem;
		height: 0.5rem;
	}

	.notification-snippet {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.tabular {
		font-variant-numeric: tabular-nums;
	}
</style>
