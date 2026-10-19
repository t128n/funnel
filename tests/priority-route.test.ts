import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { getPriorityState } from "#lib/server/issues/priority";
import { upsertIssue, upsertRepo } from "#lib/server/sync/mirror";
import { PATCH } from "#/routes/api/mirror/issues/[owner]/[repo]/[number]/priority/+server";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

const OWNER = "orgA";
const REPO = "core";

beforeEach(() => {
  clearMirror();
  setConfig(TEST_CONFIG);
  upsertRepo({ githubId: 1, org: OWNER, name: REPO, archived: false });
  upsertIssue(
    {
      githubId: 101,
      repoId: 1,
      number: 1,
      title: "Issue 1",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      createdAt: 1,
      updatedAt: 1,
      closedAt: null,
      labels: [],
      assignees: [],
      comments: [],
    },
    { status: null, size: null, blocked: false, labelConflict: false },
  );
});

const params = (number = "1", owner = OWNER, repo = REPO) => ({
  owner,
  repo,
  number,
});

function request(body: unknown): Request {
  return new Request("http://x/api/mirror/issues/orgA/core/1/priority", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const viewer = (role = "write") => ({
  user: { id: "u1", name: "Me", email: "m@example.com", image: null, role },
  session: null,
});

function call(body: unknown, locals = viewer()) {
  return PATCH({
    params: params(),
    request: request(body),
    locals,
  } as never);
}

describe("PATCH /api/mirror/issues/{owner}/{repo}/{number}/priority", () => {
  test("stores the axes and returns the derived priority", async () => {
    const res = await call({ impact: 1, urgency: 2 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      impact: 1,
      urgency: 2,
      priority: "P0",
    });
    expect(getPriorityState(OWNER, REPO, 1)).toMatchObject({
      priority: "P0",
    });
  });

  test("omitting an axis preserves its stored value", async () => {
    await call({ impact: 2, urgency: 2 });
    const res = await call({ urgency: 1 });
    expect(await res.json()).toMatchObject({
      impact: 2,
      urgency: 1,
      priority: "P0",
    });
  });

  test("both axes null clears the derived value", async () => {
    await call({ impact: 1, urgency: 1 });
    const res = await call({ impact: null, urgency: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ priority: null });
  });

  test("rejects an out-of-range axis", async () => {
    const res = await call({ impact: 9 });
    expect(res.status).toBe(400);
  });

  test("requires a write session", async () => {
    expect((await call({ impact: 1 }, { user: null, session: null })).status).toBe(
      401,
    );
    expect((await call({ impact: 1 }, viewer("read"))).status).toBe(403);
  });

  test("404s for an unmirrored repository", async () => {
    const res = await PATCH({
      params: params("1", "orgA", "ghost"),
      request: request({ impact: 1 }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(404);
  });

  test("404s for an unmirrored issue number", async () => {
    const res = await PATCH({
      params: params("999"),
      request: request({ impact: 1 }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(404);
  });
});
