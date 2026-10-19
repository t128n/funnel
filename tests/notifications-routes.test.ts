import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import type { RenderedIssueDetail } from "#lib/server/issues/types";
import {
	createNotifications,
	listNotifications,
	watchIssue,
} from "#lib/server/notifications/service";
import { upsertIssue, upsertRepo, type UserRecord } from "#lib/server/sync/mirror";
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

// Routes read the signed-in user's rows only. Each test uses distinct ids so
// the shared in-memory DB never leaks rows between cases.
const OWNER = "routesqa";
const REPO = "sandbox";
const REPO_ID = 900_501;

function viewer(id: string, role = "read") {
	return { user: { id, role }, session: null };
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

function seedDraft(userId: string, key: string) {
	createNotifications([
		{
			userId,
			kind: "assigned",
			dedupeKey: `routes:${key}`,
			createdAt: 1000,
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
		seedDraft("routes_a", "a");
		seedDraft("routes_b", "b");

		const res = await getNotifications({
			locals: viewer("routes_a"),
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
	});

	test("test_read_and_read_all: read state persists and count drops", async () => {
		seedDraft("routes_read", "r1");
		seedDraft("routes_read", "r2");
		const [first] = listNotifications("routes_read");

		const one = await postNotifications({
			locals: viewer("routes_read"),
			url: notificationRequest(),
			request: postRequest({ id: first!.id }),
		} as never);
		expect(one.status).toBe(200);
		expect(((await one.json()) as { unreadCount: number }).unreadCount).toBe(1);

		const listed = await getNotifications({
			locals: viewer("routes_read"),
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
			locals: viewer("routes_read"),
			url: notificationRequest(),
			request: postRequest({ all: true }),
		} as never);
		expect(all.status).toBe(200);
		expect(((await all.json()) as { unreadCount: number }).unreadCount).toBe(0);
	});

	test("test_watch_toggle_round_trip: PUT then DELETE changes watching", async () => {
		const auth = viewer("routes_watch");

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
		const auth = viewer("routes_detail");
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
		const missing = await getWatch({
			params: { owner: OWNER, repo: "missing", number: "1" },
			request: watchRequest("GET"),
			locals: viewer("routes_watch"),
		} as never);
		expect(missing.status).toBe(404);

		const invalid = await getWatch({
			params: { owner: OWNER, repo: REPO, number: "0" },
			request: watchRequest("GET"),
			locals: viewer("routes_watch"),
		} as never);
		expect(invalid.status).toBe(400);
	});
});
