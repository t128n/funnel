import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import {
  stateIntakeSubmission,
  stateSnooze,
  stateTriageEvent,
} from "#lib/server/db/schema";
import { createSubmission } from "#lib/server/intake/staging";
import { isIssueSnoozed, isSubmissionSnoozed } from "#lib/server/snooze";
import {
  DELETE as clearSnooze,
  POST as createSnooze,
} from "#/routes/api/snooze/+server";

const WRITER = { user: { id: "writer", role: "write" }, session: null };
const READER = { user: { id: "reader", role: "read" }, session: null };

function post(body: unknown) {
  return new Request("http://x/api/snooze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del(query: string): URL {
  return new URL(`http://x/api/snooze${query}`);
}

beforeEach(() => {
  db.delete(stateSnooze).run();
  db.delete(stateTriageEvent).run();
  db.delete(stateIntakeSubmission).run();
});

afterEach(() => {
  db.delete(stateSnooze).run();
});

describe("snooze API", () => {
  test("requires a write session", async () => {
    const response = await createSnooze({
      request: post({ kind: "submission", id: "x", until: Date.now() + 1000 }),
      locals: { user: null, session: null },
    } as never);
    expect(response.status).toBe(401);

    const writeOnly = await createSnooze({
      request: post({ kind: "submission", id: "x", until: Date.now() + 1000 }),
      locals: READER,
    } as never);
    expect(writeOnly.status).toBe(403);
  });

  test("rejects a past or malformed request", async () => {
    const { id } = createSubmission({ title: "Route" });

    const past = await createSnooze({
      request: post({ kind: "submission", id, until: Date.now() - 1 }),
      locals: WRITER,
    } as never);
    expect(past.status).toBe(400);

    const malformed = await createSnooze({
      request: post({ kind: "issue", repo: "orgA/core" }),
      locals: WRITER,
    } as never);
    expect(malformed.status).toBe(400);
  });

  test("snoozes and resurfaces a submission", async () => {
    const { id } = createSubmission({ title: "Route" });
    const until = Date.now() + 60_000;

    const response = await createSnooze({
      request: post({ kind: "submission", id, until }),
      locals: WRITER,
    } as never);
    expect(response.status).toBe(200);
    expect(isSubmissionSnoozed(id)).toBe(true);

    const cleared = await clearSnooze({
      url: del(`?kind=submission&id=${encodeURIComponent(id)}`),
      locals: WRITER,
    } as never);
    expect(await cleared.json()).toEqual({ cleared: true });
    expect(isSubmissionSnoozed(id)).toBe(false);
  });

  test("snoozes an issue by repo slug and number", async () => {
    const until = Date.now() + 60_000;
    const response = await createSnooze({
      request: post({ kind: "issue", repo: "orgA/core", number: 7, until }),
      locals: WRITER,
    } as never);
    expect(response.status).toBe(200);
    expect(isIssueSnoozed("orgA/core", 7)).toBe(true);

    const cleared = await clearSnooze({
      url: del("?kind=issue&repo=orgA/core&number=7"),
      locals: WRITER,
    } as never);
    expect(await cleared.json()).toEqual({ cleared: true });
    expect(isIssueSnoozed("orgA/core", 7)).toBe(false);
  });

  test("rejects an unknown delete kind and invalid issue number", async () => {
    const unknown = await clearSnooze({
      url: del("?kind=nope"),
      locals: WRITER,
    } as never);
    expect(unknown.status).toBe(400);

    const badNumber = await clearSnooze({
      url: del("?kind=issue&repo=orgA/core&number=0"),
      locals: WRITER,
    } as never);
    expect(badNumber.status).toBe(400);
  });
});
