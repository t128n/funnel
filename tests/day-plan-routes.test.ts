import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { authUser } from "#lib/server/db/schema";
import { writeWorkHours } from "#lib/server/planning/day-store";
import { listDayBlocks } from "#lib/server/planning/day-store";
import { setPlanItem } from "#lib/server/planning/store";
import {
  resetPlanning,
  seedPlanningIssue,
  seedPlanningRepo,
} from "#tests/planning-helpers";
import { PUT } from "#/routes/api/me/day-plan/+server";
import { POST } from "#/routes/api/me/day-plan/auto/+server";

const USER = "day_plan_user";
const DATE = "2026-10-21";
const WEEK = "2026-10-19";

const READ_LOCALS = {
  user: {
    id: USER,
    name: "Planner",
    email: "planner@example.com",
    image: null,
    role: "read",
  },
  session: null,
};
const ANON_LOCALS = { user: null, session: null };

function seedUser(): void {
  const now = new Date();
  db.insert(authUser)
    .values({
      id: USER,
      name: USER,
      email: `${USER}@example.com`,
      emailVerified: true,
      role: "read",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

function block(
  startMinute: number,
  minutes: number,
  issueNumber: number | null,
) {
  return issueNumber === null
    ? {
        startMinute,
        minutes,
        kind: "buffer" as const,
        org: null,
        name: null,
        issueNumber: null,
      }
    : {
        startMinute,
        minutes,
        kind: "issue" as const,
        org: "orgA",
        name: "core",
        issueNumber,
      };
}

function putRequest(body: unknown): Request {
  return new Request("http://x/api/me/day-plan", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function autoRequest(body: unknown): Request {
  return new Request("http://x/api/me/day-plan/auto", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedRepoAndIssues(): void {
  const repoId = seedPlanningRepo("orgA/core");
  seedPlanningIssue({ repoId, number: 1, size: "md", priority: "P1" });
  seedPlanningIssue({ repoId, number: 2, size: "md", priority: "P1" });
  seedPlanningIssue({
    repoId,
    number: 3,
    state: "closed",
    size: "md",
    priority: "P1",
  });
}

beforeEach(() => {
  resetPlanning();
  seedUser();
});

afterEach(() => {
  // Cascades every state_* row owned by the user.
  db.delete(authUser).where(eq(authUser.id, USER)).run();
  resetPlanning();
});

describe("PUT /api/me/day-plan", () => {
  test("test_session_required", async () => {
    const res = await PUT({
      request: putRequest({ date: DATE, blocks: [] }),
      locals: ANON_LOCALS,
    } as never);

    expect(res.status).toBe(401);
  });

  test("test_save_replaces", async () => {
    seedRepoAndIssues();

    const first = await PUT({
      request: putRequest({
        date: DATE,
        blocks: [block(540, 60, 1), block(660, 30, 2)],
      }),
      locals: READ_LOCALS,
    } as never);
    expect(first.status).toBe(200);
    const saved = (await first.json()) as { blocks: unknown[] };
    expect(saved.blocks).toHaveLength(2);
    expect(listDayBlocks(USER, DATE, DATE)).toHaveLength(2);

    const second = await PUT({
      request: putRequest({ date: DATE, blocks: [block(600, 45, 1)] }),
      locals: READ_LOCALS,
    } as never);
    expect(second.status).toBe(200);
    const replaced = (await second.json()) as {
      blocks: { startMinute: number; date: string; id: string }[];
    };
    expect(replaced.blocks).toHaveLength(1);
    expect(replaced.blocks[0]).toMatchObject({ startMinute: 600, date: DATE });
    expect(typeof replaced.blocks[0].id).toBe("string");
    expect(listDayBlocks(USER, DATE, DATE)).toEqual(replaced.blocks);
  });

  test("test_overlap_400", async () => {
    seedRepoAndIssues();

    const res = await PUT({
      request: putRequest({
        date: DATE,
        blocks: [block(540, 60, 1), block(570, 30, 2)],
      }),
      locals: READ_LOCALS,
    } as never);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("Blocks overlap at 09:30");
    expect(listDayBlocks(USER, DATE, DATE)).toEqual([]);
  });

  test("test_unknown_issue_400", async () => {
    seedRepoAndIssues();

    const missing = await PUT({
      request: putRequest({ date: DATE, blocks: [block(540, 60, 999)] }),
      locals: READ_LOCALS,
    } as never);
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { message: string }).message).toContain(
      "not mirrored",
    );

    const closed = await PUT({
      request: putRequest({ date: DATE, blocks: [block(540, 60, 3)] }),
      locals: READ_LOCALS,
    } as never);
    expect(closed.status).toBe(400);
    expect(((await closed.json()) as { message: string }).message).toContain(
      "closed",
    );

    expect(listDayBlocks(USER, DATE, DATE)).toEqual([]);
  });

  test("test_bad_date", async () => {
    const res = await PUT({
      request: putRequest({ date: "2026-02-30", blocks: [] }),
      locals: READ_LOCALS,
    } as never);

    expect(res.status).toBe(400);
    expect(listDayBlocks(USER, "2026-02-01", "2026-03-01")).toEqual([]);
  });
});

describe("POST /api/me/day-plan/auto", () => {
  test("test_session_required", async () => {
    const res = await POST({
      request: autoRequest({ date: DATE }),
      locals: ANON_LOCALS,
    } as never);

    expect(res.status).toBe(401);
  });

  test("test_auto_persists", async () => {
    seedRepoAndIssues();
    for (const issueNumber of [1, 2]) {
      setPlanItem({ org: "orgA", name: "core", issueNumber, weekStart: WEEK });
    }
    writeWorkHours(USER, {
      timezone: "UTC",
      startMinute: 540,
      endMinute: 1020,
      workDays: [1, 2, 3, 4, 5],
      bufferPercent: 20,
    });

    const res = await POST({
      request: autoRequest({ date: DATE }),
      locals: READ_LOCALS,
    } as never);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      blocks: {
        startMinute: number;
        minutes: number;
        kind: "issue" | "buffer";
      }[];
    };
    expect(body.blocks.length).toBeGreaterThan(0);

    // Persisted exactly as returned.
    expect(listDayBlocks(USER, DATE, DATE)).toEqual(body.blocks);

    // Hours respected: every block sits inside 09:00–17:00.
    for (const saved of body.blocks) {
      expect(saved.startMinute).toBeGreaterThanOrEqual(540);
      expect(saved.startMinute + saved.minutes).toBeLessThanOrEqual(1020);
    }

    // The first P1 issue is planned and the reserved share stays free.
    const issueMinutes = body.blocks
      .filter((saved) => saved.kind === "issue")
      .reduce((total, saved) => total + saved.minutes, 0);
    const bufferPlanned = body.blocks
      .filter((saved) => saved.kind === "buffer")
      .reduce((total, saved) => total + saved.minutes, 0);
    expect(issueMinutes).toBe(240);
    expect(bufferPlanned).toBeGreaterThanOrEqual(96);
    expect(issueMinutes + bufferPlanned).toBe(480);
  });

  test("test_bad_date", async () => {
    const res = await POST({
      request: autoRequest({ date: "2026-02-30" }),
      locals: READ_LOCALS,
    } as never);

    expect(res.status).toBe(400);
  });
});
