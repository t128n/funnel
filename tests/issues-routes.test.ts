import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { symmetricEncrypt } from "better-auth/crypto";
import { FUNNEL_SECRET } from "$app/env/private";
import { setConfig } from "#/lib/server/config";
import { db } from "#/lib/server/db/index";
import { authAccount, authUser } from "#/lib/server/db/schema";
import { forge } from "#/lib/server/forge/providers.server";
import { POST as createIssue } from "#/routes/api/repos/[owner]/[repo]/issues/+server";
import { PATCH as patchIssue } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/+server";
import { POST as addComment } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/comments/+server";
import { POST as createMilestone } from "#/routes/api/repos/[owner]/[repo]/milestones/+server";
import { TEST_CONFIG } from "#tests/test-config";

// Route wiring with the user-token client exercised end to end: a seeded
// `auth_account` supplies the (encrypted) token and `fetch` is stubbed at the
// GitHub API boundary. A repo unique to this file avoids colliding with the
// process-wide installation-id cache used by other suites.
const OWNER = "funnelqa";
const REPO = "sandbox";
const REPO_SLUG = `${OWNER}/${REPO}`;

const realFetch = globalThis.fetch;
const calls: string[] = [];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function stubFetch(
  input: unknown,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const path = url.pathname;
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  calls.push(`${method} ${path}`);

  if (path.endsWith("/installation")) return json({ id: 7 });
  if (path.includes("/app/installations/")) {
    return json({
      token: "installation-token",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
  }
  const issueUrl = new RegExp(`/repos/${OWNER}/${REPO}/issues$`);
  const numberUrl = new RegExp(`/repos/${OWNER}/${REPO}/issues/42$`);
  const commentUrl = new RegExp(`/repos/${OWNER}/${REPO}/issues/42/comments$`);
  const milestoneUrl = new RegExp(`/repos/${OWNER}/${REPO}/milestones$`);
  const repoUrl = new RegExp(`/repos/${OWNER}/${REPO}$`);

  if (method === "POST" && issueUrl.test(path)) {
    return json({ number: 42, html_url: `https://github.com/${REPO_SLUG}/issues/42` }, 201);
  }
  if (method === "POST" && milestoneUrl.test(path)) {
    return json(
      {
        id: 11,
        number: 3,
        title: "v1",
        state: "open",
        html_url: `https://github.com/${REPO_SLUG}/milestone/3`,
      },
      201,
    );
  }
  if (method === "GET" && milestoneUrl.test(path)) {
    return json([]);
  }
  if (method === "PATCH" && numberUrl.test(path)) {
    return json({ number: 42, html_url: `https://github.com/${REPO_SLUG}/issues/42` });
  }
  if (method === "POST" && commentUrl.test(path)) {
    return json(
      { id: 9, html_url: `https://github.com/${REPO_SLUG}/issues/42#issuecomment-9` },
      201,
    );
  }
  if (method === "GET" && numberUrl.test(path)) {
    return json({ number: 42 });
  }
  if (method === "GET" && repoUrl.test(path)) {
    return json({ id: 1, name: REPO, owner: { login: OWNER } });
  }
  return json({});
}

async function seedViewer(): Promise<void> {
  const now = new Date();
  await db
    .insert(authUser)
    .values({
      id: "issues_user_1",
      name: "Me",
      email: "issues-user@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(authAccount)
    .values({
      id: "issues_acc_1",
      accountId: "4242",
      providerId: "github",
      userId: "issues_user_1",
      accessToken: await symmetricEncrypt({ key: FUNNEL_SECRET, data: "ghu_token" }),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

function request(method: string, body?: unknown): Request {
  return new Request(`http://x/api/repos/${REPO_SLUG}/issues`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const viewer = () => ({
  user: { id: "issues_user_1", role: "write" },
  session: null,
});
const repoParams = () => ({ owner: OWNER, repo: REPO });

beforeEach(async () => {
  calls.length = 0;
  setConfig({
    ...TEST_CONFIG,
    repos: [{ repo: REPO_SLUG, shortcode: "CORE" }],
  });
  forge.resetCaches();
  globalThis.fetch = stubFetch as typeof fetch;
  await seedViewer();
});

afterEach(async () => {
  // Let the fire-and-forget refresh finish against the stub before it is removed.
  await new Promise((resolve) => setTimeout(resolve, 150));
  globalThis.fetch = realFetch;
});

describe("POST /api/repos/{owner}/{repo}/issues", () => {
  test("creates the issue with the user token", async () => {
    const res = await createIssue({
      params: repoParams(),
      request: request("POST", { title: "New bug", status: "todo" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      number: 42,
      htmlUrl: `https://github.com/${REPO_SLUG}/issues/42`,
    });
    expect(calls).toContain(`POST /repos/${REPO_SLUG}/issues`);
  });

  test("requires authentication", async () => {
    const res = await createIssue({
      params: repoParams(),
      request: request("POST", { title: "New bug" }),
      locals: { user: null, session: null },
    } as never);

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  test("rejects an invalid body", async () => {
    const res = await createIssue({
      params: repoParams(),
      request: request("POST", { title: "  " }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("rejects malformed JSON", async () => {
    const res = await createIssue({
      params: repoParams(),
      request: new Request(`http://x/api/repos/${REPO_SLUG}/issues`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
  });

  test("maps a missing linked account to 502", async () => {
    const res = await createIssue({
      params: repoParams(),
      request: request("POST", { title: "New bug" }),
      locals: { user: { id: "ghost", role: "write" }, session: null },
    } as never);

    expect(res.status).toBe(502);
  });

  test("maps a mutation failure to its status and message", async () => {
    setConfig({ ...TEST_CONFIG, repos: [] });
    const res = await createIssue({
      params: repoParams(),
      request: request("POST", { title: "New bug" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      message: `Repository ${REPO_SLUG} is not configured`,
    });
  });
});

describe("PATCH /api/repos/{owner}/{repo}/issues/{number}", () => {
  test("updates with the user token", async () => {
    const res = await patchIssue({
      params: { ...repoParams(), number: "42" },
      request: request("PATCH", { title: "Renamed" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(200);
    expect(calls).toContain(`PATCH /repos/${REPO_SLUG}/issues/42`);
  });

  test("rejects an invalid issue number", async () => {
    const res = await patchIssue({
      params: { ...repoParams(), number: "abc" },
      request: request("PATCH", { title: "Renamed" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
  });

  test("rejects an invalid update body", async () => {
    const res = await patchIssue({
      params: { ...repoParams(), number: "42" },
      request: request("PATCH", { title: "   " }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("closes with a state reason", async () => {
    const res = await patchIssue({
      params: { ...repoParams(), number: "42" },
      request: request("PATCH", { state: "closed", state_reason: "not_planned" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(200);
    expect(calls).toContain(`PATCH /repos/${REPO_SLUG}/issues/42`);
  });

  test("reopens without a state reason", async () => {
    const res = await patchIssue({
      params: { ...repoParams(), number: "42" },
      request: request("PATCH", { state: "open" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(200);
    expect(calls).toContain(`PATCH /repos/${REPO_SLUG}/issues/42`);
  });

  test("rejects an invalid state reason", async () => {
    const res = await patchIssue({
      params: { ...repoParams(), number: "42" },
      request: request("PATCH", { state: "closed", state_reason: "bogus" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("sets and clears the milestone", async () => {
    const set = await patchIssue({
      params: { ...repoParams(), number: "42" },
      request: request("PATCH", { milestone: 3 }),
      locals: viewer(),
    } as never);
    expect(set.status).toBe(200);
    expect(calls).toContain(`PATCH /repos/${REPO_SLUG}/issues/42`);

    const clear = await patchIssue({
      params: { ...repoParams(), number: "42" },
      request: request("PATCH", { milestone: null }),
      locals: viewer(),
    } as never);
    expect(clear.status).toBe(200);
  });

  test("rejects an invalid milestone", async () => {
    const res = await patchIssue({
      params: { ...repoParams(), number: "42" },
      request: request("PATCH", { milestone: 0 }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/repos/{owner}/{repo}/milestones", () => {
  test("creates a milestone with the user token", async () => {
    const res = await createMilestone({
      params: repoParams(),
      request: new Request(`http://x/api/repos/${REPO_SLUG}/milestones`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "v1", dueOn: "2026-05-01" }),
      }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      number: 3,
      htmlUrl: `https://github.com/${REPO_SLUG}/milestone/3`,
    });
    expect(calls).toContain(`POST /repos/${REPO_SLUG}/milestones`);
  });

  test("rejects a blank title", async () => {
    const res = await createMilestone({
      params: repoParams(),
      request: new Request(`http://x/api/repos/${REPO_SLUG}/milestones`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "   " }),
      }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("requires the write role", async () => {
    const res = await createMilestone({
      params: repoParams(),
      request: new Request(`http://x/api/repos/${REPO_SLUG}/milestones`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "v1" }),
      }),
      locals: { user: { id: "issues_user_1", role: "read" }, session: null },
    } as never);

    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/repos/{owner}/{repo}/issues/{number}/comments", () => {
  test("posts a comment with the user token", async () => {
    const res = await addComment({
      params: { ...repoParams(), number: "42" },
      request: request("POST", { body: "hello" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: 9,
      htmlUrl: `https://github.com/${REPO_SLUG}/issues/42#issuecomment-9`,
    });
    expect(calls).toContain(`POST /repos/${REPO_SLUG}/issues/42/comments`);
  });

  test("rejects an empty comment", async () => {
    const res = await addComment({
      params: { ...repoParams(), number: "42" },
      request: request("POST", { body: "   " }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(400);
  });
});
