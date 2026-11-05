import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import {
  mirrorThread,
  stateIssueWaiting,
} from "#lib/server/db/schema";
import { getWaiting, isWaiting } from "#lib/server/waiting";
import {
  upsertIssue,
  upsertRepo,
  type IssueRecord,
} from "#lib/server/sync/mirror";
import {
  DELETE as clearWaitingRoute,
  POST as setWaitingRoute,
} from "#/routes/api/waiting/+server";
import { clearMirror } from "#tests/mirror-helpers";

const WRITER = { user: { id: "writer", role: "write" }, session: null };
const READER = { user: { id: "reader", role: "read" }, session: null };

function post(body: unknown) {
  return new Request("http://x/api/waiting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del(query: string): URL {
  return new URL(`http://x/api/waiting${query}`);
}

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
  const issue: IssueRecord = {
    externalId: "101",
    repoId: repo.id,
    number: 7,
    kind: "issue",
    title: "Waiting route",
    body: "Untouched body",
    state: "open",
    stateReason: null,
    author: null,
    milestoneNumber: null,
    url: "",
    createdAt: 1,
    updatedAt: 1,
    closedAt: null,
    labels: [],
    assignees: [],
    comments: [],
  };
  upsertIssue(issue, {
    status: "todo",
    impact: null,
    urgency: null,
    priority: null,
    size: null,
    blocked: false,
    labelConflict: false,
  });
  return repo.id;
}

beforeEach(() => {
  db.delete(stateIssueWaiting).run();
  clearMirror();
  seed();
});

afterEach(() => {
  db.delete(stateIssueWaiting).run();
});

describe("waiting API", () => {
  test("requires a write session", async () => {
    const anonymous = await setWaitingRoute({
      request: post({ repo: "orgA/core", number: 7, reason: "other" }),
      locals: { user: null, session: null },
    } as never);
    expect(anonymous.status).toBe(401);

    const reader = await setWaitingRoute({
      request: post({ repo: "orgA/core", number: 7, reason: "other" }),
      locals: READER,
    } as never);
    expect(reader.status).toBe(403);

    const anonymousClear = await clearWaitingRoute({
      url: del("?repo=orgA/core&number=7"),
      locals: { user: null, session: null },
    } as never);
    expect(anonymousClear.status).toBe(401);
  });

  test("rejects malformed bodies, reasons and dates", async () => {
    const invalidJson = await setWaitingRoute({
      request: new Request("http://x/api/waiting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      locals: WRITER,
    } as never);
    expect(invalidJson.status).toBe(400);

    const malformed = await setWaitingRoute({
      request: post({ repo: "orgA/core", number: 7 }),
      locals: WRITER,
    } as never);
    expect(malformed.status).toBe(400);

    const badReason = await setWaitingRoute({
      request: post({ repo: "orgA/core", number: 7, reason: "bored" }),
      locals: WRITER,
    } as never);
    expect(badReason.status).toBe(400);

    const badDate = await setWaitingRoute({
      request: post({
        repo: "orgA/core",
        number: 7,
        reason: "other",
        recheckOn: "2026-02-30",
      }),
      locals: WRITER,
    } as never);
    expect(badDate.status).toBe(400);
  });

  test("sets, updates and clears an issue without touching its body", async () => {
    const created = await setWaitingRoute({
      request: post({
        repo: "orgA/core",
        number: 7,
        reason: "waiting-on-vendor",
        note: "Vendor ticket 42",
        recheckOn: "2026-10-25",
      }),
      locals: WRITER,
    } as never);
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      repo: "orgA/core",
      number: 7,
      reason: "waiting-on-vendor",
      note: "Vendor ticket 42",
      recheckOn: "2026-10-25",
      actorUserId: "writer",
    });
    expect(isWaiting("orgA/core", 7)).toBe(true);

    const updated = await setWaitingRoute({
      request: post({
        repo: "orgA/core",
        number: 7,
        reason: "needs-info",
      }),
      locals: WRITER,
    } as never);
    expect(updated.status).toBe(200);
    expect(getWaiting("orgA/core", 7)?.reason).toBe("needs-info");

    const cleared = await clearWaitingRoute({
      url: del("?repo=orgA/core&number=7"),
      locals: WRITER,
    } as never);
    expect(await cleared.json()).toEqual({ cleared: true });
    expect(isWaiting("orgA/core", 7)).toBe(false);

    expect(
      db.select({ body: mirrorThread.body }).from(mirrorThread).all()[0]?.body,
    ).toBe("Untouched body");
  });

  test("rejects a missing repo and invalid number on clear", async () => {
    const missing = await clearWaitingRoute({
      url: del("?number=7"),
      locals: WRITER,
    } as never);
    expect(missing.status).toBe(400);

    const badNumber = await clearWaitingRoute({
      url: del("?repo=orgA/core&number=0"),
      locals: WRITER,
    } as never);
    expect(badNumber.status).toBe(400);
  });
});
