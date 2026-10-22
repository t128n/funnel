import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import {
  upsertIssue,
  upsertRepo,
  type UserRecord,
} from "#lib/server/sync/mirror";
import type { RenderedIssueDetail } from "#lib/server/issues/types";
import { GET as getDetail } from "#/routes/api/mirror/issues/[owner]/[repo]/[number]/+server";
import { GET as getList } from "#/routes/api/mirror/issues/[owner]/[repo]/+server";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

// The mirror reads now require a signed-in `read` session (RBAC).
const READ = { user: { id: "reader", role: "read" }, session: null };

// The Inspector's read path: the mirror route renders untrusted Markdown to
// sanitized HTML at the delivery boundary (SPEC §2.2) while preserving the raw
// body for inline editing.
function user(externalId: string, login: string): UserRecord {
	return {
		id: 0,
		externalId,
		forge: "github",
		instance: "github.com",
		login,
		avatarUrl: `https://avatars/${login}.png`,
		url: `https://github.com/${login}`,
	};
}

let repoId = 0;

function seed(): number {
	const repo = upsertRepo({
		externalId: "1",
		forge: "github",
		instance: "github.com",
		org: "orgA",
		name: "core",
		url: "https://github.com/orgA/core",
		archived: false,
	});
	repoId = repo.id;
	upsertIssue(
		{
			externalId: "101",
			repoId: repo.id,
			number: 1,
			kind: "issue",
			title: "Alpha crash",
			body: "# Hi\n\n<img src=x onerror=alert(1)>\n\n[js](javascript:alert(1))",
			state: "open",
			stateReason: null,
			author: user("7", "octocat"),
			milestoneNumber: null,
			url: "https://github.com/orgA/core/issues/1",
			createdAt: 1,
			updatedAt: 100,
			closedAt: null,
			labels: ["todo"],
			assignees: [],
			comments: [
				{
					externalId: "1001",
					author: user("7", "octocat"),
					body: "**bold** comment",
					createdAt: 11,
					updatedAt: 11,
				},
			],
		},
		{ status: "todo", priority: null, size: null, blocked: false, labelConflict: false },
	);
	return repo.id;
}

function req(owner = "orgA", repo = "core", number = "1"): Request {
	return new Request(
		`http://x/api/mirror/issues/${owner}/${repo}/${number}`,
	);
}

function listReq(owner = "orgA", repo = "core", query = ""): URL {
	return new URL(`http://x/api/mirror/issues/${owner}/${repo}${query}`);
}

beforeEach(() => {
	clearMirror();
	setConfig(TEST_CONFIG);
	seed();
});

describe("GET /api/mirror/issues/{owner}/{repo}/{number}", () => {
	test("renders sanitized HTML alongside the raw Markdown", async () => {
		const res = await getDetail({
			params: { owner: "orgA", repo: "core", number: "1" },
			request: req(),
			locals: READ,
		} as never);

		expect(res.status).toBe(200);
		const detail = (await res.json()) as RenderedIssueDetail;

		// Raw Markdown is preserved for the inline editor.
		expect(detail.body).toContain("<img src=x onerror=alert(1)>");

		// Rendered HTML is present and sanitized.
		expect(detail.bodyHtml).toContain("<h1>Hi</h1>");
		expect(detail.bodyHtml).not.toContain("onerror");
		// The image survives with only allowlisted attributes.
		expect(detail.bodyHtml).toContain('<img loading="lazy" src="x" />');
		expect(detail.bodyHtml).not.toContain("javascript:");

		// Comments carry their own rendered HTML.
		expect(detail.comments[0]?.body).toBe("**bold** comment");
		expect(detail.comments[0]?.bodyHtml.trim()).toBe(
			"<p><strong>bold</strong> comment</p>",
		);
	});

	test("returns 404 for an unmirrored issue", async () => {
		const res = await getDetail({
			params: { owner: "orgA", repo: "core", number: "999" },
			request: req("orgA", "core", "999"),
			locals: READ,
		} as never);

		expect(res.status).toBe(404);
	});

	test("returns 400 for an invalid issue number", async () => {
		const res = await getDetail({
			params: { owner: "orgA", repo: "core", number: "abc" },
			request: req("orgA", "core", "abc"),
			locals: READ,
		} as never);

		expect(res.status).toBe(400);
	});
});

describe("GET /api/mirror/issues/{owner}/{repo}", () => {
	test("lists mirrored issues, most recently updated first", async () => {
		upsertIssue(
			{
				externalId: "102",
				repoId,
				number: 2,
				kind: "issue",
				title: "Beta regression",
				body: "",
				state: "closed",
				stateReason: "completed",
				author: user("7", "octocat"),
				milestoneNumber: null,
				url: "https://github.com/orgA/core/issues/2",
				createdAt: 2,
				updatedAt: 200,
				closedAt: 200,
				labels: [],
				assignees: [],
				comments: [],
			},
			{ status: null, priority: null, size: null, blocked: false, labelConflict: false },
		);

		const res = await getList({
			params: { owner: "orgA", repo: "core" },
			url: listReq(),
			locals: READ,
		} as never);

		expect(res.status).toBe(200);
		const issues = (await res.json()) as Array<{
			number: number;
			title: string;
			state: string;
		}>;
		expect(issues.map((issue) => issue.number)).toEqual([2, 1]);
		expect(issues[0]).toEqual({
			number: 2,
			title: "Beta regression",
			state: "closed",
		});
	});

	test("returns 404 for an unmirrored repo", async () => {
		const res = await getList({
			params: { owner: "orgA", repo: "missing" },
			url: listReq("orgA", "missing"),
			locals: READ,
		} as never);

		expect(res.status).toBe(404);
	});
});
