import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { symmetricEncrypt } from "better-auth/crypto";
import { FUNNEL_SECRET } from "$app/env/private";
import { setConfig } from "#/lib/server/config";
import { db } from "#/lib/server/db/index";
import { authAccount, authUser, stateCommentReaction } from "#/lib/server/db/schema";
import { forge } from "#/lib/server/forge/providers.server";
import {
  DELETE as deleteComment,
  PATCH as patchComment,
} from "#/routes/api/repos/[owner]/[repo]/issues/[number]/comments/[commentId]/+server";
import {
  DELETE as deleteReaction,
  POST as addReaction,
} from "#/routes/api/repos/[owner]/[repo]/issues/[number]/comments/[commentId]/reactions/+server";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

// The comment lifecycle runs with the signed-in user's token. `fetch` is
// stubbed at the GitHub API boundary so the exact upstream method/path pair is
// asserted, while the routes keep their real auth, validation and refresh code.
const OWNER = "commentqa";
const REPO = "sandbox";
const REPO_SLUG = `${OWNER}/${REPO}`;

const realFetch = globalThis.fetch;
const calls: string[] = [];
let forbidden = false;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function stubFetch(input: unknown, init?: RequestInit): Promise<Response> {
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
  if (path === "/user") return json({ login: "Me" });

  if (path.endsWith("/issues/comments/9") && (method === "PATCH" || method === "DELETE")) {
    if (forbidden) return json({ message: "Resource not accessible" }, 403);
    if (method === "DELETE") return new Response(null, { status: 204 });
    const body = JSON.parse(String(init?.body ?? "{}")) as { body?: string };
    return json({
      id: 9,
      body: body.body,
      html_url: `https://github.com/${REPO_SLUG}/issues/5#issuecomment-9`,
    });
  }
  if (path.endsWith("/issues/comments/9/reactions")) {
    if (forbidden) return json({ message: "Resource not accessible" }, 403);
    if (method === "POST") return json({ id: 77, content: "+1" }, 201);
    return json([
      { id: 77, content: "+1", user: { login: "Me" } },
    ]);
  }
  if (path.endsWith("/issues/comments/9/reactions/77") && method === "DELETE") {
    return new Response(null, { status: 204 });
  }
  return json({});
}

async function seedViewer(): Promise<void> {
  const now = new Date();
  await db
    .insert(authUser)
    .values({
      id: "comment_user_1",
      name: "Me",
      email: "comment-user@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(authAccount)
    .values({
      id: "comment_acc_1",
      accountId: "4242",
      providerId: "github",
      userId: "comment_user_1",
      accessToken: await symmetricEncrypt({ key: FUNNEL_SECRET, data: "ghu_token" }),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

const viewer = () => ({
  user: { id: "comment_user_1", role: "write" },
  session: null,
});
const params = () => ({
  owner: OWNER,
  repo: REPO,
  number: "5",
  commentId: "9",
});

function request(method: string, body?: unknown): Request {
  return new Request(`http://x/api/repos/${REPO_SLUG}/issues/5/comments/9`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function reactionRequest(method: string, content?: string): Request {
  const query = content === undefined ? "" : `?content=${encodeURIComponent(content)}`;
  return new Request(
    `http://x/api/repos/${REPO_SLUG}/issues/5/comments/9/reactions${query}`,
    { method },
  );
}

beforeEach(async () => {
  calls.length = 0;
  forbidden = false;
  clearMirror();
  db.delete(stateCommentReaction).run();
  setConfig({ ...TEST_CONFIG, repos: [{ repo: REPO_SLUG, shortcode: "CORE" }] });
  forge.resetCaches();
  globalThis.fetch = stubFetch as typeof fetch;
  await seedViewer();
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  globalThis.fetch = realFetch;
});

describe("PATCH /api/repos/{owner}/{repo}/issues/{number}/comments/{commentId}", () => {
  test("edits a comment with the user token", async () => {
    const res = await patchComment({
      params: params(),
      request: request("PATCH", { body: "  revised  " }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 9 });
    expect(calls).toContain(`PATCH /repos/${REPO_SLUG}/issues/comments/9`);
  });

  test("rejects an empty body, a bad id and a read-only viewer", async () => {
    const empty = await patchComment({
      params: params(),
      request: request("PATCH", { body: "   " }),
      locals: viewer(),
    } as never);
    expect(empty.status).toBe(400);

    const badId = await patchComment({
      params: { ...params(), commentId: "0" },
      request: request("PATCH", { body: "x" }),
      locals: viewer(),
    } as never);
    expect(badId.status).toBe(400);

    const denied = await patchComment({
      params: params(),
      request: request("PATCH", { body: "x" }),
      locals: { user: { id: "comment_user_1", role: "read" }, session: null },
    } as never);
    expect(denied.status).toBe(403);
    expect(calls.some((call) => call.startsWith("PATCH "))).toBe(false);
  });

  test("surfaces GitHub's permission refusal clearly", async () => {
    forbidden = true;
    const res = await patchComment({
      params: params(),
      request: request("PATCH", { body: "x" }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("GitHub denied permission to edit comment 9");
  });
});

describe("DELETE /api/repos/{owner}/{repo}/issues/{number}/comments/{commentId}", () => {
  test("deletes the comment", async () => {
    const res = await deleteComment({
      params: params(),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 9 });
    expect(calls).toContain(`DELETE /repos/${REPO_SLUG}/issues/comments/9`);
  });

  test("requires the write role", async () => {
    const res = await deleteComment({
      params: params(),
      locals: {},
    } as never);
    expect(res.status).toBe(401);
  });
});

describe("comment reactions", () => {
  test("adds a reaction, records the viewer chip and asks GitHub", async () => {
    const res = await addReaction({
      params: params(),
      request: request("POST", { content: "+1" }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 9, content: "+1", reacted: true });
    expect(calls).toContain(`POST /repos/${REPO_SLUG}/issues/comments/9/reactions`);
    const rows = db.select().from(stateCommentReaction).all();
    expect(rows).toEqual([
      expect.objectContaining({
        userId: "comment_user_1",
        repo: REPO_SLUG,
        commentExternalId: "9",
        content: "+1",
      }),
    ]);
  });

  test("removes the viewer's reaction by content", async () => {
    const res = await deleteReaction({
      params: params(),
      request: reactionRequest("DELETE", "+1"),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 9, content: "+1", reacted: false });
    expect(calls).toContain(`GET /repos/${REPO_SLUG}/issues/comments/9/reactions`);
    expect(calls).toContain(
      `DELETE /repos/${REPO_SLUG}/issues/comments/9/reactions/77`,
    );
    expect(db.select().from(stateCommentReaction).all()).toHaveLength(0);
  });

  test("rejects an unknown reaction name and a missing content", async () => {
    const invalid = await addReaction({
      params: params(),
      request: request("POST", { content: "sparkles" }),
      locals: viewer(),
    } as never);
    expect(invalid.status).toBe(400);

    const missing = await deleteReaction({
      params: params(),
      request: reactionRequest("DELETE"),
      locals: viewer(),
    } as never);
    expect(missing.status).toBe(400);
  });
});
