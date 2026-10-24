import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { symmetricEncrypt } from "better-auth/crypto";
import { FUNNEL_SECRET } from "$app/env/private";
import { setConfig } from "#/lib/server/config";
import { db } from "#/lib/server/db/index";
import { authAccount, authUser } from "#/lib/server/db/schema";
import { forge } from "#/lib/server/forge/providers.server";
import { deriveMetadata } from "#lib/server/sync/conflicts";
import { resetEventBus } from "#lib/server/sync/events";
import { upsertIssue, upsertRepo } from "#lib/server/sync/mirror";
import { PUT as putEpic } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/epic/+server";
import { PUT as putChildren } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/epic/children/+server";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

const OWNER = "epicqa";
const REPO = "sandbox";
const SLUG = `${OWNER}/${REPO}`;
const NUMBER = 1;
const realFetch = globalThis.fetch;
const calls: string[] = [];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function issueJson(body = ""): Record<string, unknown> {
  return {
    number: NUMBER,
    title: "Epic",
    body,
    state: "open",
    state_reason: null,
    labels: [],
    user: null,
    assignees: [],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    html_url: `https://github.com/${SLUG}/issues/${NUMBER}`,
  };
}

async function stubFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  calls.push(`${method} ${url.pathname}`);

  if (url.pathname.endsWith("/installation")) return json({ id: 7 });
  if (url.pathname.includes("/app/installations/")) {
    return json({
      token: "installation-token",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
  }
  if (/\/issues\/1\/labels$/.test(url.pathname)) return json([]);
  if (/\/issues\/1$/.test(url.pathname)) return json(issueJson());
  return json({});
}

async function seedViewer(): Promise<void> {
  const now = new Date();
  await db
    .insert(authUser)
    .values({
      id: "epic_user_1",
      name: "Me",
      email: "epic-user@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(authAccount)
    .values({
      id: "epic_acc_1",
      accountId: "5252",
      providerId: "github",
      userId: "epic_user_1",
      accessToken: await symmetricEncrypt({ key: FUNNEL_SECRET, data: "ghu_token" }),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

const viewer = (role: "read" | "write" = "write") => ({
  user: { id: "epic_user_1", role },
  session: null,
});

const params = () => ({ owner: OWNER, repo: REPO, number: String(NUMBER) });

function request(body: unknown): Request {
  return new Request(`http://x/api/repos/${SLUG}/issues/${NUMBER}/epic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedMirror(body = ""): void {
  const repo = upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: OWNER,
    name: REPO,
    url: `https://github.com/${SLUG}`,
    archived: false,
  });
  const derived = deriveMetadata(["epic"]);
  upsertIssue(
    {
      externalId: "101",
      repoId: repo.id,
      number: NUMBER,
      kind: "issue",
      title: "Epic",
      body,
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "",
      createdAt: 1,
      updatedAt: 1,
      closedAt: null,
      labels: ["epic"],
      assignees: [],
      comments: [],
    },
    {
      status: derived.status,
      impact: derived.impact,
      urgency: derived.urgency,
      priority: derived.priority,
      size: derived.size,
      blocked: derived.blocked,
      isEpic: derived.isEpic,
      labelConflict: false,
    },
  );
}

beforeEach(async () => {
  calls.length = 0;
  clearMirror();
  resetEventBus();
  setConfig({ ...TEST_CONFIG, repos: [{ repo: SLUG, shortcode: "EPC" }] });
  forge.resetCaches();
  globalThis.fetch = stubFetch as typeof fetch;
  await seedViewer();
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  globalThis.fetch = realFetch;
});

describe("PUT /api/repos/{owner}/{repo}/issues/{number}/epic", () => {
  test("test_epic_write_role", async () => {
    const res = await putEpic({
      params: params(),
      request: request({ is_epic: true }),
      locals: viewer("read"),
    } as never);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  test("requires authentication", async () => {
    const res = await putEpic({
      params: params(),
      request: request({ is_epic: true }),
      locals: { user: null, session: null },
    } as never);
    expect(res.status).toBe(401);
  });

  test("adds the epic label with the user token", async () => {
    const res = await putEpic({
      params: params(),
      request: request({ is_epic: true }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isEpic: true });
    expect(calls).toContain(`PUT /repos/${SLUG}/issues/${NUMBER}/labels`);
  });
});

describe("PUT /api/repos/{owner}/{repo}/issues/{number}/epic/children", () => {
  test("test_epic_children_write_role", async () => {
    const res = await putChildren({
      params: params(),
      request: request({ children: ["epicqa/sandbox#2"] }),
      locals: viewer("read"),
    } as never);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  test("replaces the child list", async () => {
    seedMirror();
    const res = await putChildren({
      params: params(),
      request: request({ children: ["epicqa/sandbox#2"] }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ children: ["epicqa/sandbox#2"] });
    const patch = calls.find((call) => call.startsWith("PATCH "));
    expect(patch).toBe(`PATCH /repos/${SLUG}/issues/${NUMBER}`);
  });
});
