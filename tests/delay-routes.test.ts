import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import { db } from "#/lib/server/db/index";
import { stateIssueDelay } from "#/lib/server/db/schema";
import { openDelay } from "#/lib/server/actuals/store";
import { resetEventBus, subscribe, type SyncEvent } from "#/lib/server/sync/events";
import { upsertRepo } from "#/lib/server/sync/mirror";
import { POST as createDelay } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/delays/+server";
import {
  DELETE as deleteDelay,
  PATCH as patchDelay,
} from "#/routes/api/repos/[owner]/[repo]/issues/[number]/delays/[id]/+server";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

const OWNER = "delaysqa";
const REPO = "sandbox";
const SLUG = `${OWNER}/${REPO}`;
const NUMBER = 1;
const MINUTE = 60_000;

const viewer = (role: "read" | "write" = "write") => ({
  user: { id: "delay_user_1", name: "Me", email: "d@example.com", image: null, role },
  session: null,
});

const params = (id?: string) => ({
  owner: OWNER,
  repo: REPO,
  number: String(NUMBER),
  ...(id ? { id } : {}),
});

function request(method: string, body: unknown): Request {
  return new Request(`http://x/api/repos/${SLUG}/issues/${NUMBER}/delays`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function create(body: Record<string, unknown>): Promise<Response> {
  return createDelay({
    params: params(),
    request: request("POST", body),
    locals: viewer(),
  } as never);
}

beforeEach(() => {
  clearMirror();
  db.delete(stateIssueDelay).run();
  setConfig({
    ...TEST_CONFIG,
    repos: [{ repo: SLUG, shortcode: "DLY" }],
  });
  upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: OWNER,
    name: REPO,
    url: `https://github.com/${SLUG}`,
    archived: false,
  });
});

afterEach(() => {
  resetEventBus();
});

describe("POST /api/repos/{owner}/{repo}/issues/{number}/delays", () => {
  test("creates a manual delay", async () => {
    const res = await create({
      reason: "dependency",
      started_at: "2026-10-24T12:00:00.000Z",
      ended_at: Date.parse("2026-10-24T13:00:00.000Z"),
      note: "  waiting on the API  ",
    });
    expect(res.status).toBe(201);
    const delay = (await res.json()) as Record<string, unknown>;
    expect(delay).toMatchObject({
      reason: "dependency",
      startedAt: Date.parse("2026-10-24T12:00:00.000Z"),
      endedAt: Date.parse("2026-10-24T13:00:00.000Z"),
      note: "waiting on the API",
      source: "manual",
      issueNumber: NUMBER,
    });
  });

  test("rejects a read-only session", async () => {
    const res = await createDelay({
      params: params(),
      request: request("POST", { reason: "info" }),
      locals: viewer("read"),
    } as never);
    expect(res.status).toBe(403);
  });

  test("rejects an unknown reason", async () => {
    const res = await create({ reason: "blocked" });
    expect(res.status).toBe(400);
  });

  test("rejects an invalid timestamp", async () => {
    const res = await create({ reason: "info", started_at: "yesterday" });
    expect(res.status).toBe(400);
  });

  test("rejects an end before the start", async () => {
    const res = await create({
      reason: "info",
      started_at: MINUTE,
      ended_at: 0,
    });
    expect(res.status).toBe(400);
  });

  test("404s for an unmirrored repository", async () => {
    clearMirror();
    const res = await create({ reason: "info" });
    expect(res.status).toBe(404);
  });

  test("publishes an issues event", async () => {
    const seen: SyncEvent[] = [];
    const unsubscribe = subscribe((event) => seen.push(event));
    await create({ reason: "capacity" });
    unsubscribe();
    expect(seen).toContainEqual({
      type: "issues",
      repo: SLUG,
      numbers: [NUMBER],
    });
  });
});

describe("PATCH and DELETE delays", () => {
  async function createManual(): Promise<string> {
    const res = await create({ reason: "dependency", started_at: MINUTE });
    return ((await res.json()) as { id: string }).id;
  }

  test("edits a manual delay", async () => {
    const id = await createManual();
    const res = await patchDelay({
      params: params(id),
      request: request("PATCH", {
        reason: "review",
        ended_at: 2 * MINUTE,
        note: "in review",
      }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id,
      reason: "review",
      endedAt: 2 * MINUTE,
      note: "in review",
    });
  });

  test("deletes a manual delay", async () => {
    const id = await createManual();
    const first = await deleteDelay({
      params: params(id),
      locals: viewer(),
    } as never);
    expect(first.status).toBe(204);
    const second = await deleteDelay({
      params: params(id),
      locals: viewer(),
    } as never);
    expect(second.status).toBe(404);
  });

  test("404s for a delay belonging to another issue", async () => {
    const id = await createManual();
    const res = await patchDelay({
      params: { ...params(id), number: "2" },
      request: request("PATCH", { note: "nope" }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(404);
  });

  test("rejects an end before the start", async () => {
    const id = await createManual();
    const res = await patchDelay({
      params: params(id),
      request: request("PATCH", { ended_at: 0 }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(400);
  });

  test("automatic delays are read-only", async () => {
    const blocked = openDelay({
      org: OWNER,
      name: REPO,
      issueNumber: NUMBER,
      reason: "external",
      startedAt: MINUTE,
    });
    const patched = await patchDelay({
      params: params(blocked.id),
      request: request("PATCH", { note: "nope" }),
      locals: viewer(),
    } as never);
    expect(patched.status).toBe(403);

    const removed = await deleteDelay({
      params: params(blocked.id),
      locals: viewer(),
    } as never);
    expect(removed.status).toBe(403);
    expect(db.select().from(stateIssueDelay).all()).toHaveLength(1);
  });

  test("requires the write role", async () => {
    const id = await createManual();
    const res = await patchDelay({
      params: params(id),
      request: request("PATCH", { note: "x" }),
      locals: viewer("read"),
    } as never);
    expect(res.status).toBe(403);
  });
});
