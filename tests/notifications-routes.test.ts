import { beforeEach, describe, expect, test } from "bun:test";
import {
	markNotificationsRead,
	setIssueWatching,
} from "#lib/client/mutations";
import { setConfig } from "#lib/server/config";
import type { RenderedIssueDetail } from "#lib/server/issues/types";
import {
	createNotifications,
	listNotifications,
	unreadNotificationCount,
	watchIssue,
} from "#lib/server/notifications/service";
import { upsertIssue, upsertRepo, type UserRecord } from "#lib/server/sync/mirror";
import { load as loadAppLayout } from "#/routes/(app)/+layout.server";
import { load as loadNotificationPage } from "#/routes/(app)/notifications/+page.server";
import {
	GET as getNotifications,
	POST as postNotifications,
} from "#/routes/api/notifications/+server";
import { GET as getDetail } from "#/routes/api/mirror/issues/[owner]/[repo]/[number]/+server";
import {
	DELETE as deleteWatch,
	GET as getWatch,
	PUT as putWatch,
} from "#/routes/api/mirror/issues/[owner]/[repo]/[number]/watch/+server";
import { TEST_CONFIG } from "#tests/test-config";

// Routes read the signed-in user's rows only. Every case gets fresh user ids so
// the shared in-memory DB cannot leak read state between cases (or between
// repeated runs of this file).
const OWNER = "routesqa";
const REPO = "sandbox";
const REPO_ID = 900_501;

function uniqueId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID()}`;
}

function viewer(id: string, role = "read") {
	return { user: { id, role }, session: null };
}

/** The full shape `requireUser` projects for a page/layout load. */
function layoutUser(id: string, role = "read") {
	return {
		id,
		name: id,
		email: `${id}@example.com`,
		image: null,
		role,
	};
}

function user(githubId: number, login: string): UserRecord {
	return { githubId, login, avatarUrl: `https://avatars/${login}.png` };
}

function notificationRequest(query = ""): URL {
	return new URL(`http://x/api/notifications${query}`);
}

function postRequest(body: unknown): Request {
	return new Request("http://x/api/notifications", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

function watchRequest(method: string): Request {
	return new Request(`http://x/api/mirror/issues/${OWNER}/${REPO}/1/watch`, {
		method,
	});
}

function watchParams() {
	return { owner: OWNER, repo: REPO, number: "1" };
}

function seedDraft(userId: string, key: string, createdAt = 1000) {
	createNotifications([
		{
			userId,
			kind: "assigned",
			dedupeKey: `routes:${userId}:${key}`,
			createdAt,
			url: `/issues/${OWNER}/${REPO}/1`,
			title: `Issue ${key}`,
		},
	]);
}

beforeEach(() => {
	setConfig(TEST_CONFIG);
	upsertRepo({ githubId: REPO_ID, org: OWNER, name: REPO, archived: false });
});

describe("notification routes", () => {
	test("test_notifications_require_read_role: no session gives 401", async () => {
		const anonymous = { user: null, session: null };

		const list = await getNotifications({
			locals: anonymous,
			url: notificationRequest(),
			request: new Request("http://x/api/notifications"),
		} as never);
		expect(list.status).toBe(401);

		const read = await postNotifications({
			locals: anonymous,
			url: notificationRequest(),
			request: postRequest({ all: true }),
		} as never);
		expect(read.status).toBe(401);
	});

	test("test_notifications_are_user_scoped: user A never receives user B rows", async () => {
		const a = uniqueId("routes_a");
		const b = uniqueId("routes_b");
		seedDraft(a, "a");
		seedDraft(b, "b");

		const res = await getNotifications({
			locals: viewer(a),
			url: notificationRequest(),
			request: new Request("http://x/api/notifications"),
		} as never);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			items: Array<{ id: string; title?: string }>;
			unreadCount: number;
		};
		expect(body.items).toHaveLength(1);
		expect(body.items[0]?.title).toBe("Issue a");
		expect(body.unreadCount).toBe(1);

		// B still owns exactly their row; A's response above did not consume it.
		const bRes = await getNotifications({
			locals: viewer(b),
			url: notificationRequest(),
			request: new Request("http://x/api/notifications"),
		} as never);
		const bBody = (await bRes.json()) as {
			items: Array<{ title?: string }>;
			unreadCount: number;
		};
		expect(bBody.items).toHaveLength(1);
		expect(bBody.items[0]?.title).toBe("Issue b");
		expect(bBody.unreadCount).toBe(1);
	});

	test("test_read_and_read_all: read state persists and count drops", async () => {
		const userId = uniqueId("routes_read");
		seedDraft(userId, "r1");
		seedDraft(userId, "r2");
		const [first] = listNotifications(userId);

		const one = await postNotifications({
			locals: viewer(userId),
			url: notificationRequest(),
			request: postRequest({ id: first!.id }),
		} as never);
		expect(one.status).toBe(200);
		expect(((await one.json()) as { unreadCount: number }).unreadCount).toBe(1);

		const listed = await getNotifications({
			locals: viewer(userId),
			url: notificationRequest(),
			request: new Request("http://x/api/notifications"),
		} as never);
		const afterOne = (await listed.json()) as {
			items: Array<{ id: string; readAt: number | null }>;
			unreadCount: number;
		};
		expect(afterOne.unreadCount).toBe(1);
		expect(afterOne.items.find((item) => item.id === first!.id)?.readAt).not.toBeNull();

		const all = await postNotifications({
			locals: viewer(userId),
			url: notificationRequest(),
			request: postRequest({ all: true }),
		} as never);
		expect(all.status).toBe(200);
		expect(((await all.json()) as { unreadCount: number }).unreadCount).toBe(0);
	});

	test("unread=1 returns only unread rows while the count stays complete", async () => {
		const userId = uniqueId("routes_unread");
		seedDraft(userId, "u1");
		seedDraft(userId, "u2");
		const [first] = listNotifications(userId);
		await postNotifications({
			locals: viewer(userId),
			url: notificationRequest(),
			request: postRequest({ id: first!.id }),
		} as never);

		const res = await getNotifications({
			locals: viewer(userId),
			url: notificationRequest("?unread=1"),
			request: new Request("http://x/api/notifications?unread=1"),
		} as never);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			items: Array<{ id: string }>;
			unreadCount: number;
		};
		expect(body.items).toHaveLength(1);
		expect(body.items[0]?.id).not.toBe(first!.id);
		expect(body.unreadCount).toBe(1);
	});

	test("after returns only rows newer than the cursor", async () => {
		const userId = uniqueId("routes_after");
		seedDraft(userId, "old", 1000);
		seedDraft(userId, "new", 2000);

		const res = await getNotifications({
			locals: viewer(userId),
			url: notificationRequest("?after=1500"),
			request: new Request("http://x/api/notifications?after=1500"),
		} as never);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			items: Array<{ title?: string; createdAt: number }>;
			unreadCount: number;
		};
		expect(body.items).toHaveLength(1);
		expect(body.items[0]?.title).toBe("Issue new");
		expect(body.items[0]?.createdAt).toBe(2000);
		expect(body.unreadCount).toBe(2);
	});

	test("mark one and mark all never touch another user's rows", async () => {
		const a = uniqueId("routes_mark_a");
		const b = uniqueId("routes_mark_b");
		seedDraft(a, "own");
		seedDraft(b, "foreign");
		const [foreign] = listNotifications(b);

		const one = await postNotifications({
			locals: viewer(a),
			url: notificationRequest(),
			request: postRequest({ id: foreign!.id }),
		} as never);
		expect(one.status).toBe(200);
		// A's own row is untouched and B's row is still unread.
		expect(unreadNotificationCount(a)).toBe(1);
		expect(unreadNotificationCount(b)).toBe(1);

		const all = await postNotifications({
			locals: viewer(a),
			url: notificationRequest(),
			request: postRequest({ all: true }),
		} as never);
		expect(all.status).toBe(200);
		expect(((await all.json()) as { unreadCount: number }).unreadCount).toBe(0);
		expect(unreadNotificationCount(a)).toBe(0);
		expect(unreadNotificationCount(b)).toBe(1);
	});

	test("test_watch_toggle_round_trip: PUT then DELETE changes watching", async () => {
		const auth = viewer(uniqueId("routes_watch"));

		const initial = await getWatch({
			params: watchParams(),
			request: watchRequest("GET"),
			locals: auth,
		} as never);
		expect(initial.status).toBe(200);
		expect(((await initial.json()) as { watching: boolean }).watching).toBe(false);

		const on = await putWatch({
			params: watchParams(),
			request: watchRequest("PUT"),
			locals: auth,
		} as never);
		expect(on.status).toBe(200);
		expect(((await on.json()) as { watching: boolean }).watching).toBe(true);

		const watching = await getWatch({
			params: watchParams(),
			request: watchRequest("GET"),
			locals: auth,
		} as never);
		expect(((await watching.json()) as { watching: boolean }).watching).toBe(true);

		const off = await deleteWatch({
			params: watchParams(),
			request: watchRequest("DELETE"),
			locals: auth,
		} as never);
		expect(off.status).toBe(200);
		expect(((await off.json()) as { watching: boolean }).watching).toBe(false);
	});

	test("watch state is per user", async () => {
		const watcher = viewer(uniqueId("routes_watch_a"));
		const bystander = viewer(uniqueId("routes_watch_b"));

		await putWatch({
			params: watchParams(),
			request: watchRequest("PUT"),
			locals: watcher,
		} as never);

		const res = await getWatch({
			params: watchParams(),
			request: watchRequest("GET"),
			locals: bystander,
		} as never);
		expect(res.status).toBe(200);
		expect(((await res.json()) as { watching: boolean }).watching).toBe(false);
	});

	test("detail carries the viewer's watching state", async () => {
		upsertIssue(
			{
				githubId: 900_502,
				repoId: REPO_ID,
				number: 1,
				title: "Watched issue",
				body: "",
				state: "open",
				stateReason: null,
				author: user(900_503, "octocat"),
				milestoneNumber: null,
				createdAt: 1,
				updatedAt: 2,
				closedAt: null,
				labels: [],
				assignees: [],
				comments: [],
			},
			{ status: null, priority: null, size: null, blocked: false, labelConflict: false },
		);
		const auth = viewer(uniqueId("routes_detail"));
		watchIssue(auth.user.id, OWNER, REPO, 1);

		const res = await getDetail({
			params: watchParams(),
			request: new Request(`http://x/api/mirror/issues/${OWNER}/${REPO}/1`),
			locals: auth,
		} as never);

		expect(res.status).toBe(200);
		expect(((await res.json()) as RenderedIssueDetail).watching).toBe(true);
	});

	test("watch rejects an unmirrored repo and invalid issue number", async () => {
		const auth = viewer(uniqueId("routes_watch_invalid"));

		const missing = await getWatch({
			params: { owner: OWNER, repo: "missing", number: "1" },
			request: watchRequest("GET"),
			locals: auth,
		} as never);
		expect(missing.status).toBe(404);

		const invalid = await getWatch({
			params: { owner: OWNER, repo: REPO, number: "0" },
			request: watchRequest("GET"),
			locals: auth,
		} as never);
		expect(invalid.status).toBe(400);
	});
});

describe("notification center", () => {
	test("test_page_loads_own_items: the page load returns only the viewer's rows", async () => {
		const a = uniqueId("routes_page_a");
		const b = uniqueId("routes_page_b");
		seedDraft(a, "page_a1");
		seedDraft(a, "page_a2");
		seedDraft(b, "page_b");

		const data = await loadNotificationPage({
			locals: viewer(a),
			url: new URL("http://x/notifications"),
		} as never);

		expect(data.items).toHaveLength(2);
		expect(data.items.map((item) => item.title).sort()).toEqual([
			"Issue page_a1",
			"Issue page_a2",
		]);
		expect(data.unreadCount).toBe(2);
	});

	test("test_unread_badge_matches_count: the layout badge is this viewer's service count", async () => {
		const a = uniqueId("routes_badge_a");
		const b = uniqueId("routes_badge_b");
		seedDraft(a, "badge_a1");
		seedDraft(a, "badge_a2");
		seedDraft(b, "badge_b");

		const data = await loadAppLayout({
			locals: { user: layoutUser(a), session: null },
			url: new URL("http://x/issues"),
			cookies: { get: () => undefined },
		} as never);

		expect(data.unreadNotifications).toBe(unreadNotificationCount(a));
		expect(data.unreadNotifications).toBe(2);
	});

	test("test_watch_button_calls_api: PUT for on and DELETE for off", async () => {
		const originalFetch = globalThis.fetch;
		const calls: Array<{ url: string; method: string }> = [];
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const method = init?.method ?? "GET";
			calls.push({ url: String(input), method });
			return Response.json({ watching: method === "PUT" });
		}) as typeof fetch;

		try {
			const on = await setIssueWatching("orgA/core", 7, true);
			expect(on.ok).toBe(true);
			expect(on.ok && on.value.watching).toBe(true);

			const off = await setIssueWatching("orgA/core", 7, false);
			expect(off.ok).toBe(true);
			expect(off.ok && off.value.watching).toBe(false);

			expect(calls).toEqual([
				{ url: "/api/mirror/issues/orgA/core/7/watch", method: "PUT" },
				{ url: "/api/mirror/issues/orgA/core/7/watch", method: "DELETE" },
			]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("markNotificationsRead posts one id or the all flag", async () => {
		const originalFetch = globalThis.fetch;
		const bodies: unknown[] = [];
		globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return Response.json({ unreadCount: 0 });
		}) as typeof fetch;

		try {
			const one = await markNotificationsRead({ id: "notification-1" });
			expect(one).toEqual({ ok: true, value: { unreadCount: 0 } });

			const all = await markNotificationsRead({ all: true });
			expect(all).toEqual({ ok: true, value: { unreadCount: 0 } });
			expect(bodies).toEqual([{ id: "notification-1" }, { all: true }]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
