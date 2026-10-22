import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import {
	replaceRepoAssignees,
	replaceRepoLabels,
	upsertIssue,
	upsertRepo,
	type UserRecord,
} from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { filterOptions, getIssueDetail } from "./queries";

const FORGE = "github";
const INSTANCE = "github.com";

/** The internal repo id assigned by the mirror on seed. */
let coreId = 0;

function user(externalId: string, login: string): UserRecord {
	return {
		id: 0,
		externalId,
		forge: FORGE,
		instance: INSTANCE,
		login,
		avatarUrl: `https://avatars/${login}.png`,
		url: `https://github.com/${login}`,
	};
}

function repo(externalId: string, org: string, name: string): number {
	return upsertRepo({
		externalId,
		forge: FORGE,
		instance: INSTANCE,
		org,
		name,
		url: `https://github.com/${org}/${name}`,
		archived: false,
	}).id;
}

function seed(): void {
	coreId = repo("1", "orgA", "core");
	repo("2", "orgA", "web");

	replaceRepoLabels(coreId, [
		{ name: "bug", color: "ee5396", description: "a bug" },
		{ name: "frontend", color: "78a9ff", description: "" },
		{ name: "todo", color: "78a9ff", description: "Status: Todo" },
	]);

	// Assignable collaborators for the repo; `me` (the issue's assignee below)
	// is deliberately not among them to exercise the picker's union with current
	// assignees.
	replaceRepoAssignees(coreId, [user("50", "collaborator")]);

	upsertIssue(
		{
			externalId: "101",
			kind: "issue",
			repoId: coreId,
			number: 1,
			title: "Alpha crash",
			body: "line one\nline two",
			url: "https://github.com/orgA/core/issues/1",
			state: "open",
			stateReason: null,
			author: user("7", "octocat"),
			milestoneNumber: null,
			createdAt: 1,
			updatedAt: 100,
			closedAt: null,
			labels: ["todo", "p1", "bug", "frontend"],
			assignees: [user("42", "me")],
			comments: [
				{
					externalId: "1001",
					author: user("7", "octocat"),
					body: "repro steps\nmore",
					createdAt: 11,
					updatedAt: 11,
				},
				{
					externalId: "1002",
					author: null,
					body: "ghost comment",
					createdAt: 12,
					updatedAt: 12,
				},
			],
		},
		{ status: "todo", priority: "p1", size: null, blocked: false, labelConflict: false },
	);
}

beforeEach(() => {
	clearMirror();
	setConfig(TEST_CONFIG);
	seed();
});

describe("getIssueDetail", () => {
	test("returns the row, body, ordered comments, and repo labels", () => {
		const detail = getIssueDetail(coreId, 1);
		expect(detail).toBeDefined();
		expect(detail?.issue.title).toBe("Alpha crash");
		expect(detail?.body).toBe("line one\nline two");
		expect(detail?.comments.map((c) => c.externalId)).toEqual(["1001", "1002"]);
		expect(detail?.comments[0]?.author).toMatchObject({
			externalId: "7",
			forge: "github",
			instance: "github.com",
			login: "octocat",
		});
		expect(detail?.comments[1]?.author).toBeNull();
		expect(detail?.comments[1]?.body).toBe("ghost comment");
		// Repo label options include the reserved ones too (the UI filters them).
		expect(detail?.repoLabels.map((l) => l.name)).toEqual([
			"bug",
			"frontend",
			"todo",
		]);
		// Assignable collaborators plus the issue's current assignee, sorted.
		expect(detail?.assigneeOptions.map((u) => u.login)).toEqual([
			"collaborator",
			"me",
		]);
	});

	test("returns undefined for an unmirrored issue", () => {
		expect(getIssueDetail(coreId, 999)).toBeUndefined();
		expect(getIssueDetail(99, 1)).toBeUndefined();
	});
});

describe("filterOptions", () => {
	test("lists sorted repos, distinct assignees, and non-reserved labels", () => {
		const options = filterOptions();
		expect(options.repos.map((r) => r.slug)).toEqual([
			"orgA/core",
			"orgA/web",
		]);
		// Union of repo collaborators and existing assignees, sorted by login.
		expect(options.assignees.map((u) => u.login)).toEqual([
			"collaborator",
			"me",
		]);
		expect(options.assignees.map((u) => u.externalId)).toEqual(["50", "42"]);
		expect(options.repos.map((r) => r.id)).toEqual([coreId, coreId + 1]);
		// `todo` and `p1` are reserved and must not surface as filter labels.
		expect(options.labels).toEqual(["bug", "frontend"]);
	});
});
