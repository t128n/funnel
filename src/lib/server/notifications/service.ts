/**
 * Notification store (T1). Wave 0 stubs: every operation throws until T1
 * implements persistence, recipient resolution and the SSE signal.
 */

import type {
	NotificationDraft,
	NotificationItem,
	NotificationQuery,
	Recipient
} from './types';
import { notImplemented } from './types';

export function createNotifications(drafts: readonly NotificationDraft[]): number {
	return notImplemented('T1', 'createNotifications');
}

export function listNotifications(
	userId: string,
	opts?: NotificationQuery
): NotificationItem[] {
	return notImplemented('T1', 'listNotifications');
}

export function markNotificationRead(userId: string, id: string): boolean {
	return notImplemented('T1', 'markNotificationRead');
}

export function watchIssue(
	userId: string,
	org: string,
	name: string,
	issueNumber: number
): void {
	notImplemented('T1', 'watchIssue');
}

export function isWatching(
	userId: string,
	org: string,
	name: string,
	issueNumber: number
): boolean {
	return notImplemented('T1', 'isWatching');
}

export function listWatchers(org: string, name: string, issueNumber: number): Recipient[] {
	return notImplemented('T1', 'listWatchers');
}
