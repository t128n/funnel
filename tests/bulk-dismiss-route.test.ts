import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import {
  stateIntakeSubmission,
  stateTriageEvent,
} from "#lib/server/db/schema";
import { createSubmission, getSubmission } from "#lib/server/intake/staging";
import { POST as dismiss } from "#/routes/api/intake/dismiss/+server";

const WRITER = { user: { id: "writer", role: "write" }, session: null };
const READER = { user: { id: "reader", role: "read" }, session: null };

function post(body: unknown): Request {
  return new Request("http://x/api/intake/dismiss", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db.delete(stateTriageEvent).run();
  db.delete(stateIntakeSubmission).run();
});

describe("bulk dismiss API", () => {
  test("requires a write session", async () => {
    const anonymous = await dismiss({
      request: post({ id: "x", reason: "duplicate" }),
      locals: { user: null, session: null },
    } as never);
    expect(anonymous.status).toBe(401);

    const reader = await dismiss({
      request: post({ id: "x", reason: "duplicate" }),
      locals: READER,
    } as never);
    expect(reader.status).toBe(403);
  });

  test("rejects a missing or over-long reason and an unknown id", async () => {
    const { id } = createSubmission({ title: "Bulk dismiss" });

    const empty = await dismiss({
      request: post({ id, reason: "   " }),
      locals: WRITER,
    } as never);
    expect(empty.status).toBe(400);

    const long = await dismiss({
      request: post({ id, reason: "x".repeat(501) }),
      locals: WRITER,
    } as never);
    expect(long.status).toBe(400);

    const missing = await dismiss({
      request: post({ id: "missing", reason: "duplicate" }),
      locals: WRITER,
    } as never);
    expect(missing.status).toBe(404);
  });

  test("archives the submission with the required reason and appends an event", async () => {
    const { id } = createSubmission({ title: "Bulk dismiss" });

    const response = await dismiss({
      request: post({ id, reason: "Duplicates #12" }),
      locals: WRITER,
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id });
    expect(getSubmission(id)?.archivedAt).toBeNumber();
    expect(getSubmission(id)?.dismissReason).toBe("Duplicates #12");
    expect(
      db.select().from(stateTriageEvent).all().map((event) => event.action),
    ).toEqual(["dismissed"]);
  });
});
