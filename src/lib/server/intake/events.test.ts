import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import { stateTriageEvent } from "#lib/server/db/schema";
import {
  getTriageEvent,
  latestTriageEvent,
  listTriageEvents,
  recordTriageEvent,
} from "./events";

beforeEach(() => {
  db.delete(stateTriageEvent).run();
});

describe("triage event store", () => {
  test("appends events in insertion order and reads them back", () => {
    const dismissed = recordTriageEvent({
      submissionId: "sub-1",
      action: "dismissed",
      actorUserId: "triager",
      reason: "duplicate report",
    });
    const undone = recordTriageEvent({
      submissionId: "sub-1",
      action: "undone",
      actorUserId: "lead",
      reason: "duplicate report",
    });
    recordTriageEvent({
      submissionId: "sub-2",
      action: "accepted",
      actorUserId: "triager",
      repo: "orgA/core",
      number: 7,
    });

    expect(getTriageEvent(dismissed)).toMatchObject({
      id: dismissed,
      submissionId: "sub-1",
      action: "dismissed",
      actorUserId: "triager",
      repo: null,
      number: null,
      reason: "duplicate report",
      createdAt: expect.any(Number),
    });
    expect(getTriageEvent("nope")).toBeUndefined();
    expect(listTriageEvents("sub-1").map((event) => event.id)).toEqual([
      dismissed,
      undone,
    ]);
    expect(latestTriageEvent("sub-1")?.id).toBe(undone);
    expect(latestTriageEvent("missing")).toBeUndefined();
  });
});
