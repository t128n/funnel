/**
 * Opt-in browser notifications (T6).
 *
 * Native delivery is a per-browser opt-in that only runs while a Funnel tab is
 * open: the SSE stream carries no payload, so each tab fetches its own unread
 * feed when a `notifications` signal arrives. Permission is requested only from
 * a caller handling a user gesture (the Notifications page); nothing here asks
 * for it on mount.
 */
import { goto } from "$app/navigation";
import type { NotificationItem } from "#lib/server/notifications/types";
import { connectEvents } from "./events";

/** localStorage switch written after a successful permission grant. */
export const NATIVE_NOTIFICATIONS_KEY = "funnel.nativeNotifications";

export type NativePermission = "granted" | "denied" | "unsupported";

/**
 * Ask the browser for notification permission. Must be called from a user
 * gesture; the returned value maps a dismissed prompt to `denied`.
 */
export async function enableNativeNotifications(): Promise<NativePermission> {
	if (typeof window === "undefined" || typeof Notification === "undefined") {
		return "unsupported";
	}

	try {
		const permission = await Notification.requestPermission();
		if (permission !== "granted") return "denied";

		try {
			window.localStorage.setItem(NATIVE_NOTIFICATIONS_KEY, "true");
		} catch {
			// Private mode or a blocked storage partition: this tab still works,
			// it just will not be remembered on the next visit.
		}
		return "granted";
	} catch {
		return "unsupported";
	}
}

function isOptedIn(): boolean {
	try {
		return window.localStorage.getItem(NATIVE_NOTIFICATIONS_KEY) === "true";
	} catch {
		return false;
	}
}

function show(item: NotificationItem): void {
	const notice = new Notification(item.title ?? "Funnel", {
		body: item.body ?? "",
		tag: item.id,
	});

	notice.onclick = () => {
		window.focus();
		void goto(item.url);
		notice.close();
	};
}

/**
 * Subscribe to live notification signals while this browser is opted in.
 * Returns a cleanup function; a disabled setting, an unsupported browser or a
 * missing local opt-in all yield a no-op.
 */
export function startNativeNotifications(enabled: boolean): () => void {
	if (typeof window === "undefined" || typeof Notification === "undefined") {
		return () => {};
	}
	if (!enabled || Notification.permission !== "granted" || !isOptedIn()) {
		return () => {};
	}

	// Only rows created after this tab started are announced; the in-app center
	// already owns everything older. In-memory, so a reload starts fresh.
	let lastSeen = Date.now();
	const shown = new Set<string>();
	let stopped = false;

	const stop = connectEvents((event) => {
		if (stopped || event.type !== "notifications") return;

		const after = lastSeen;
		void fetch(`/api/notifications?after=${after}&unread=1`)
			.then((response) => response.json() as Promise<{ items?: NotificationItem[] }>)
			.then((payload) => {
				if (stopped) return;
				for (const item of payload.items ?? []) {
					lastSeen = Math.max(lastSeen, item.createdAt);
					if (shown.has(item.id)) continue;
					shown.add(item.id);
					show(item);
				}
			})
			.catch(() => {
				// A failed poll leaves `lastSeen` untouched so the next signal retries.
			});
	});

	return () => {
		stopped = true;
		stop();
	};
}
