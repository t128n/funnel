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

function user(githubId: number, login: string): UserRecord {
	return { githubId, login, avatarUrl: `https://avatars/${login}.png` };
}

function seed(): void {
	upsertRepo({ githubId: 1, org: "orgA", name: "core", archived: false });
	upsertRepo({ githubId: 2, org: "orgA", name: "web", archived: false });

	replaceRepoLabels(1, [
		{ name: "bug", color: "ee5396", description: "a bug" },
		{ name: "frontend", color: "78a9ff", description: "" },
		{ name: "todo", color: "78a9ff", description: "Status: Todo" },
	]);

	// Assignable collaborators for repo 1; `me` (the issue's assignee below) is
	// deliberately not among them to exercise the picker's union with current
	// assignees.
	replaceRepoAssignees(1, [user(50, "collaborator")]);

	upsertIssue(
		{
			githubId: 101,
			repoId: 1,
			number: 1,
			title: "Alpha crash",
			body: "line one\nline two",
			state: "open",
			stateReason: null,
			author: user(7, "octocat"),
			milestoneNumber: null,
			createdAt: 1,
			updatedAt: 100,
			closedAt: null,
			labels: ["todo", "p1", "bug", "frontend"],
			assignees: [user(42, "me")],
			comments: [
				{
					githubId: 1001,
					author: user(7, "octocat"),
					body: "repro steps\nmore",
					createdAt: 11,
					updatedAt: 11,
				},
				{
					githubId: 1002,
					author: null,
					body: "ghost comment",
					createdAt: 12,
					updatedAt: 12,
				},
			],
		},
		{ status: "todo", size: null, blocked: false, labelConflict: false },
	);
}

beforeEach(() => {
	clearMirror();
	setConfig(TEST_CONFIG);
	seed();
});

describe("getIssueDetail", () => {
	test("returns the row, body, ordered comments, and repo labels", () => {
		const detail = getIssueDetail(1, 1);
		expect(detail).toBeDefined();
		expect(detail?.issue.title).toBe("Alpha crash");
		expect(detail?.body).toBe("line one\nline two");
		expect(detail?.comments.map((c) => c.githubId)).toEqual([1001, 1002]);
		expect(detail?.comments[0]?.author?.login).toBe("octocat");
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
		expect(getIssueDetail(1, 999)).toBeUndefined();
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
		// `todo` and `p1` are reserved and must not surface as filter labels.
		expect(options.labels).toEqual(["bug", "frontend"]);
	});
});
