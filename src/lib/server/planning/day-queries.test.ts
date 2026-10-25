import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { authAccount, authUser } from "#lib/server/db/schema";
import {
  planningUser,
  resetPlanning,
  seedPlanningIssue,
  seedPlanningRepo,
} from "#tests/planning-helpers";
import { setPlanItem } from "./store";
import { listDayCandidates, listIssueTitles } from "./day-queries";

const USER = "day_queries_user";
const VIEWER_EXTERNAL_ID = "42";
/** Wednesday; its ISO Monday week starts 2026-10-19. */
const DATE = "2026-10-21";
const WEEK = "2026-10-19";

function seedViewer(id = USER, externalId = VIEWER_EXTERNAL_ID): void {
  const now = new Date();
  db.insert(authUser)
    .values({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      role: "read",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
  db.insert(authAccount)
    .values({
      id: `account_${id}`,
      accountId: externalId,
      providerId: "github",
      userId: id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

describe("day queries", () => {
  beforeEach(() => {
    resetPlanning();
    seedViewer();
  });

  afterEach(() => {
    db.delete(authUser).where(eq(authUser.id, USER)).run();
    resetPlanning();
  });

  test("test_candidates", () => {
    const repoId = seedPlanningRepo("orgA/core");
    const me = planningUser("me", VIEWER_EXTERNAL_ID);
    const other = planningUser("other", "99");

    // Included: assigned to the viewer or unassigned, open, sized, this week.
    seedPlanningIssue({
      repoId,
      number: 1,
      title: "Viewer P2",
      size: "md",
      priority: "P2",
      assignees: [me],
    });
    seedPlanningIssue({
      repoId,
      number: 2,
      title: "Unassigned P1",
      size: "sm",
      priority: "P1",
    });
    seedPlanningIssue({
      repoId,
      number: 7,
      title: "Unassigned P3",
      size: "lg",
      priority: "P3",
    });
    seedPlanningIssue({
      repoId,
      number: 8,
      title: "Unprioritized",
      size: "sm",
      priority: null,
    });

    // Excluded: someone else's, closed, unsized, or another week.
    seedPlanningIssue({
      repoId,
      number: 3,
      size: "lg",
      priority: "P1",
      assignees: [other],
    });
    seedPlanningIssue({
      repoId,
      number: 4,
      state: "closed",
      size: "md",
      priority: "P1",
    });
    seedPlanningIssue({ repoId, number: 5, size: null, priority: "P1" });
    seedPlanningIssue({
      repoId,
      number: 6,
      size: "md",
      priority: "P1",
    });

    for (const number of [1, 2, 3, 4, 5, 7, 8]) {
      setPlanItem({ org: "orgA", name: "core", issueNumber: number, weekStart: WEEK });
    }
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 6,
      weekStart: "2026-10-26",
    });

    const candidates = listDayCandidates(USER, DATE);

    expect(candidates.map((candidate) => candidate.issueNumber)).toEqual([
      2, 1, 7, 8,
    ]);
    expect(candidates.map((candidate) => candidate.priority)).toEqual([
      "P1",
      "P2",
      "P3",
      null,
    ]);
    expect(candidates[0]).toMatchObject({
      org: "orgA",
      name: "core",
      issueNumber: 2,
      title: "Unassigned P1",
      size: "sm",
      minutes: 120,
    });
    expect(candidates[1].minutes).toBe(240);
    expect(candidates[2].minutes).toBe(480);
  });

  test("orders same-priority candidates by issue number across repos", () => {
    const repoA = seedPlanningRepo("orgA/core");
    const repoB = seedPlanningRepo("orgB/core");
    seedPlanningIssue({ repoId: repoA, number: 5, size: "md", priority: "P1" });
    seedPlanningIssue({ repoId: repoB, number: 2, size: "md", priority: "P1" });
    setPlanItem({ org: "orgA", name: "core", issueNumber: 5, weekStart: WEEK });
    setPlanItem({ org: "orgB", name: "core", issueNumber: 2, weekStart: WEEK });

    const candidates = listDayCandidates(USER, DATE);

    expect(candidates.map((candidate) => candidate.issueNumber)).toEqual([2, 5]);
  });

  test("test_candidates_any_day_of_the_week", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({ repoId, number: 1, size: "md", priority: "P2" });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: WEEK,
    });

    // Sunday 2026-10-25 belongs to the same Monday week.
    expect(listDayCandidates(USER, "2026-10-25").map((c) => c.issueNumber)).toEqual([
      1,
    ]);
    // The following Monday starts a new week.
    expect(listDayCandidates(USER, "2026-10-26")).toEqual([]);
  });

  test("test_issue_titles", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({ repoId, number: 12, title: "Fix the feed" });
    seedPlanningIssue({ repoId, number: 13, title: "Other repo issue" });

    const titles = listIssueTitles([
      { org: "orgA", name: "core", issueNumber: 12 },
      { org: "orgA", name: "core", issueNumber: 404 },
    ]);

    expect(titles.size).toBe(1);
    expect(titles.get("orgA/core#12")).toMatchObject({ title: "Fix the feed" });
    expect(titles.has("orgA/core#404")).toBe(false);
  });
});
