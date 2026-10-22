import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
	authAccount,
	authUser,
	mirrorUser,
	stateIssueWatch,
	stateNotification,
} from "#lib/server/db/schema";
import { resetEventBus, subscribe } from "#lib/server/sync/events";
import {
	createNotifications,
	getRecipientByExternalId,
	getRecipientByLogin,
	isWatching,
	listAdminRecipients,
	listNotifications,
	listWatchers,
	markAllNotificationsRead,
	markNotificationRead,
	notifyNewIntake,
	unreadNotificationCount,
	unwatchIssue,
	watchIssue,
} from "./service";

function seedUser(
	id: string,
	externalId: string,
	login: string,
	role = "read",
	avatarUrl = "",
): void {
	const now = new Date();
	db.insert(authUser)
		.values({
			id,
			name: id,
			email: `${id}@example.com`,
			role,
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(authAccount)
		.values({
			id: `account-${id}`,
			accountId: externalId,
			providerId: "github",
			userId: id,
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(mirrorUser).values({ externalId, forge: "github", instance: "github.com", login, avatarUrl, url: "" }).run();
}

beforeEach(() => {
	db.delete(stateNotification).run();
	db.delete(stateIssueWatch).run();
	db.delete(authAccount).run();
	db.delete(authUser).run();
	db.delete(mirrorUser).run();
	resetEventBus();
});

describe("notification store", () => {
	test("test_unread_count_scopes_to_user", () => {
		seedUser("u1", "42", "alice");
		seedUser("u2", "43", "bob");
		createNotifications([
			{
				userId: "u1",
				kind: "assigned",
				dedupeKey: "assigned:orgA/core#7:u1:1000",
				createdAt: 1000,
			},
			{
				userId: "u2",
				kind: "assigned",
				dedupeKey: "assigned:orgA/core#7:u2:1000",
				createdAt: 1000,
			},
		]);

		expect(unreadNotificationCount("u1")).toBe(1);
		expect(unreadNotificationCount("u2")).toBe(1);
	});

	test("test_mark_all_read_only_own", () => {
		seedUser("u1", "42", "alice");
		seedUser("u2", "43", "bob");
		createNotifications([
			{
				userId: "u1",
				kind: "comment",
				dedupeKey: "comment:a",
				createdAt: 1000,
			},
			{
				userId: "u2",
				kind: "comment",
				dedupeKey: "comment:b",
				createdAt: 1000,
			},
		]);

		expect(markAllNotificationsRead("u1")).toBe(1);
		expect(unreadNotificationCount("u1")).toBe(0);
		expect(unreadNotificationCount("u2")).toBe(1);
	});

	test("test_watch_is_idempotent", () => {
		seedUser("u1", "42", "alice");
		watchIssue("u1", "orgA", "core", 7);
		watchIssue("u1", "orgA", "core", 7);

		const rows = db
			.select()
			.from(stateIssueWatch)
			.where(
				and(
					eq(stateIssueWatch.userId, "u1"),
					eq(stateIssueWatch.org, "orgA"),
					eq(stateIssueWatch.name, "core"),
					eq(stateIssueWatch.issueNumber, 7),
				),
			)
			.all();
		expect(rows).toHaveLength(1);
		expect(isWatching("u1", "orgA", "core", 7)).toBe(true);
		expect(isWatching("u2", "orgA", "core", 7)).toBe(false);
	});

	test("createNotifications skips an empty batch and publishes once per landing", () => {
		seedUser("u1", "42", "alice");
		const events: Array<Record<string, unknown>> = [];
		subscribe((event) => events.push(event as Record<string, unknown>));

		expect(createNotifications([])).toBe(0);

		const draft = {
			userId: "u1",
			kind: "assigned" as const,
			dedupeKey: "assigned:orgA/core#7:u1:1000",
			createdAt: 1000,
			title: "Fix the bug",
			url: "/issues/orgA/core/7",
			actorLogin: "bob",
			actorAvatarUrl: "https://avatars/bob.png",
		};
		expect(createNotifications([draft])).toBe(1);
		expect(createNotifications([draft])).toBe(0);
		expect(events.filter((event) => event.type === "notifications")).toHaveLength(
			1,
		);

		expect(listNotifications("u1")).toEqual([
			expect.objectContaining({
				kind: "assigned",
				title: "Fix the bug",
				url: "/issues/orgA/core/7",
				readAt: null,
				createdAt: 1000,
				actorLogin: "bob",
			}),
		]);
	});

	test("list and read operations respect user scope, ordering and filters", () => {
		seedUser("u1", "42", "alice");
		seedUser("u2", "43", "bob");
		const ids = createNotifications([
			{
				userId: "u1",
				kind: "comment",
				dedupeKey: "comment:old",
				createdAt: 1000,
				url: "/issues/orgA/core/1",
			},
			{
				userId: "u1",
				kind: "status",
				dedupeKey: "status:mid",
				createdAt: 2000,
				url: "/issues/orgA/core/2",
			},
			{
				userId: "u1",
				kind: "priority",
				dedupeKey: "priority:new",
				createdAt: 3000,
				url: "/issues/orgA/core/3",
			},
			{
				userId: "u2",
				kind: "comment",
				dedupeKey: "comment:other",
				createdAt: 4000,
				url: "/issues/orgA/core/4",
			},
		]);

		// createNotifications returns the number that landed. The item ids are
		// read back through the public list, newest first.
		expect(ids).toBe(4);
		const all = listNotifications("u1");
		expect(all.map((item) => item.createdAt)).toEqual([3000, 2000, 1000]);
		expect(listNotifications("u1", { limit: 1 })).toHaveLength(1);
		expect(listNotifications("u1", { after: 1000 }).map((item) => item.createdAt)).toEqual([
			3000, 2000,
		]);

		const newest = all[0];
		expect(markNotificationRead("u2", newest.id)).toBe(false);
		expect(markNotificationRead("u1", newest.id)).toBe(true);
		expect(markNotificationRead("u1", newest.id)).toBe(true);
		expect(unreadNotificationCount("u1")).toBe(2);
		expect(listNotifications("u1", { unreadOnly: true })).toHaveLength(2);
		expect(unreadNotificationCount("u2")).toBe(1);
	});

	test("resolves recipients by GitHub id, login and admin role", () => {
		seedUser("u1", "42", "alice", "admin", "https://avatars/alice.png");
		seedUser("u2", "43", "bob", "read");

		expect(getRecipientByExternalId("42")).toEqual({
			userId: "u1",
			externalId: "42",
			login: "alice",
			avatarUrl: "https://avatars/alice.png",
		});
		expect(getRecipientByLogin("bob")?.userId).toBe("u2");
		expect(getRecipientByExternalId("999")).toBeNull();
		expect(getRecipientByLogin("nobody")).toBeNull();
		expect(listAdminRecipients()).toEqual([
			{
				userId: "u1",
				externalId: "42",
				login: "alice",
				avatarUrl: "https://avatars/alice.png",
			},
		]);
	});

	test("lists and removes watchers with mirrored identities", () => {
		seedUser("u1", "42", "alice", "read", "https://avatars/alice.png");
		seedUser("u2", "43", "bob");
		watchIssue("u1", "orgA", "core", 7);
		watchIssue("u2", "orgA", "core", 7);
		watchIssue("u2", "orgA", "core", 8);

		expect(listWatchers("orgA", "core", 7)).toEqual([
			{
				userId: "u1",
				externalId: "42",
				login: "alice",
				avatarUrl: "https://avatars/alice.png",
			},
			{ userId: "u2", externalId: "43", login: "bob", avatarUrl: "" },
		]);

		unwatchIssue("u1", "orgA", "core", 7);
		expect(isWatching("u1", "orgA", "core", 7)).toBe(false);
		expect(listWatchers("orgA", "core", 7)).toHaveLength(1);
	});

	test("notifyNewIntake reaches admins only and de-duplicates the submission", () => {
		seedUser("u1", "42", "alice", "admin");
		seedUser("u2", "43", "bob", "admin");
		seedUser("u3", "44", "carol", "read");
		const events: Array<Record<string, unknown>> = [];
		subscribe((event) => events.push(event as Record<string, unknown>));

		const submission = { id: "sub-1", title: "Crash on save" };
		expect(notifyNewIntake(submission)).toBe(2);
		expect(notifyNewIntake(submission)).toBe(0);
		expect(unreadNotificationCount("u3")).toBe(0);
		expect(events.filter((event) => event.type === "notifications")).toHaveLength(
			1,
		);

		const items = listNotifications("u1");
		expect(items).toHaveLength(1);
		expect(items[0]).toEqual(
			expect.objectContaining({
				kind: "new_intake",
				title: "Crash on save",
				url: "/inbox/submission/sub-1",
			}),
		);
	});
});
