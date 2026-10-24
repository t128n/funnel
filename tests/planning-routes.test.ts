import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateSetting } from "#lib/server/db/schema";
import { getPlanItem, listPlanItems } from "#lib/server/planning/store";
import type { MaintainerInput } from "#lib/server/settings/store";
import {
  resetEventBus,
  subscribe,
  type SyncEvent,
} from "#lib/server/sync/events";
import { PUT, DELETE } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/plan/+server";
import {
  planningUser,
  resetPlanning,
  seedPlanningIssue,
  seedPlanningRepo,
} from "#tests/planning-helpers";

const OWNER = "orgA";
const REPO = "core";
const WEEK = "2026-10-19";

function rosterRow(login: string): MaintainerInput {
  return {
    forge: "github",
    instance: "github.com",
    external_id: login,
    login,
    avatar_url: null,
    weekly_minutes: 600,
    active: true,
  };
}

function setMaintainers(rows: MaintainerInput[]): void {
  const now = Date.now();
  db.insert(stateSetting)
    .values({
      key: "planning.maintainers",
      value: JSON.stringify(rows),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: stateSetting.key,
      set: { value: JSON.stringify(rows), updatedAt: now },
    })
    .run();
}

function clearPlanningSettings(): void {
  for (const key of [
    "planning.size_minutes",
    "planning.allocation_percent",
    "planning.maintainers",
  ]) {
    db.delete(stateSetting).where(eq(stateSetting.key, key)).run();
  }
}

function actor(role: "read" | "write") {
  return {
    user: { id: "plan_user", name: "Planner", email: "p@example.com", image: null, role },
    session: null,
  };
}

function params(number = "1") {
  return { owner: OWNER, repo: REPO, number };
}

function putRequest(body: unknown, number = "1"): Request {
  return new Request(`http://x/api/repos/${OWNER}/${REPO}/issues/${number}/plan`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(number = "1"): Request {
  return new Request(`http://x/api/repos/${OWNER}/${REPO}/issues/${number}/plan`, {
    method: "DELETE",
  });
}

function seedRepoAndIssues(): number {
  const repoId = seedPlanningRepo(`${OWNER}/${REPO}`);
  seedPlanningIssue({
    repoId,
    number: 1,
    size: "md",
    assignees: [planningUser("ann")],
  });
  seedPlanningIssue({
    repoId,
    number: 2,
    size: "md",
    assignees: [planningUser("ann")],
  });
  return repoId;
}

beforeEach(() => {
  resetPlanning();
  clearPlanningSettings();
  setMaintainers([rosterRow("ann")]);
});

afterAll(() => {
  clearPlanningSettings();
  resetEventBus();
});

describe("PUT /api/repos/{owner}/{repo}/issues/{number}/plan", () => {
  test("test_write_role_required", async () => {
    seedRepoAndIssues();

    const res = await PUT({
      params: params(),
      request: putRequest({ week_start: WEEK }),
      locals: actor("read"),
    } as never);

    expect(res.status).toBe(403);
    expect(listPlanItems()).toHaveLength(0);
  });

  test("test_invalid_body_400", async () => {
    seedRepoAndIssues();

    const res = await PUT({
      params: params(),
      request: putRequest({}),
      locals: actor("write"),
    } as never);

    expect(res.status).toBe(400);
    expect(listPlanItems()).toHaveLength(0);
  });

  test("schedules an issue and returns the stored item", async () => {
    seedRepoAndIssues();

    const res = await PUT({
      params: params(),
      request: putRequest({ week_start: WEEK }),
      locals: actor("write"),
    } as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: { weekStart: string } };
    expect(body.item.weekStart).toBe(WEEK);
    expect(getPlanItem(OWNER, REPO, 1)?.weekStart).toBe(WEEK);
  });

  test("surfaces a capacity violation as 409", async () => {
    seedRepoAndIssues();

    const first = await PUT({
      params: params(),
      request: putRequest({ week_start: WEEK }, "1"),
      locals: actor("write"),
    } as never);
    expect(first.status).toBe(200);

    const second = await PUT({
      params: params("2"),
      request: putRequest({ week_start: WEEK }, "2"),
      locals: actor("write"),
    } as never);

    expect(second.status).toBe(409);
    const body = (await second.json()) as {
      message: string;
      violations: Array<{ login: string; excessMinutes: number }>;
    };
    expect(body.violations).toHaveLength(1);
    expect(body.violations[0].login).toBe("ann");
    expect(body.violations[0].excessMinutes).toBe(120);
    expect(listPlanItems()).toHaveLength(1);
  });

  test("404s for an unmirrored issue", async () => {
    seedPlanningRepo(`${OWNER}/${REPO}`);

    const res = await PUT({
      params: params("9"),
      request: putRequest({ week_start: WEEK }, "9"),
      locals: actor("write"),
    } as never);

    expect(res.status).toBe(404);
  });

  test("test_planning_event_published", async () => {
    seedRepoAndIssues();
    const events: SyncEvent[] = [];
    const unsubscribe = subscribe((event) => events.push(event));

    try {
      const res = await PUT({
        params: params(),
        request: putRequest({ week_start: WEEK }),
        locals: actor("write"),
      } as never);
      expect(res.status).toBe(200);
    } finally {
      unsubscribe();
    }

    expect(events.map((event) => event.type)).toContain("planning");
  });
});

describe("DELETE /api/repos/{owner}/{repo}/issues/{number}/plan", () => {
  test("test_delete_clears", async () => {
    seedRepoAndIssues();
    await PUT({
      params: params(),
      request: putRequest({ week_start: WEEK }),
      locals: actor("write"),
    } as never);
    expect(getPlanItem(OWNER, REPO, 1)).toBeDefined();

    const res = await DELETE({
      params: params(),
      request: deleteRequest(),
      locals: actor("write"),
    } as never);

    expect(res.status).toBe(200);
    expect((await res.json()) as { cleared: boolean }).toEqual({ cleared: true });
    expect(getPlanItem(OWNER, REPO, 1)).toBeUndefined();

    const again = await DELETE({
      params: params(),
      request: deleteRequest(),
      locals: actor("write"),
    } as never);
    expect(again.status).toBe(200);
  });

  test("requires the write role", async () => {
    seedRepoAndIssues();

    const res = await DELETE({
      params: params(),
      request: deleteRequest(),
      locals: actor("read"),
    } as never);

    expect(res.status).toBe(403);
  });
});
