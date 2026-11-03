import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { setPlanItem } from "#lib/server/planning/store";
import type { MaintainerInput } from "#lib/server/settings/store";
import {
  planningUser,
  resetPlanning,
  seedPlanningIssue,
  seedPlanningRepo,
  type PlanningIssueSeed,
} from "#tests/planning-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { clearMirror } from "#tests/mirror-helpers";
import { weekPlan } from "./plans";

const WEEK = "2026-10-19";

function maintainer(
  login: string,
  weeklyMinutes: number,
  active = true,
): MaintainerInput {
  return {
    forge: "github",
    instance: "github.com",
    external_id: login,
    login,
    avatar_url: `https://avatars/${login}.png`,
    weekly_minutes: weeklyMinutes,
    active,
  };
}

function usePlanning(maintainers: MaintainerInput[] = []): void {
  setConfig({
    ...TEST_CONFIG,
    planning: {
      ...TEST_CONFIG.planning,
      maintainers,
    },
  });
}

describe("week and cycle plans", () => {
  beforeEach(() => {
    resetPlanning();
    usePlanning([maintainer("ann", 600)]);
  });

  test("test_week_lane_uses_60_percent", async () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({
      repoId,
      number: 1,
      size: "md",
      assignees: [planningUser("ann")],
    });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: WEEK,
    });

    const plan = await weekPlan(WEEK);

    expect(plan.weekStart).toBe(WEEK);
    expect(plan.label).toBe("19–25 Oct 2026");
    expect(plan.lanes).toHaveLength(1);
    expect(plan.lanes[0]).toMatchObject({
      maintainer: { login: "ann", weeklyMinutes: 600 },
      capMinutes: 360,
      committedMinutes: 240,
      remainingMinutes: 120,
      over: false,
    });
    expect(plan.lanes[0].issues.map((issue) => issue.number)).toEqual([1]);
  });

  test("test_unassigned_and_unestimated", async () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({ repoId, number: 1, size: "md" });
    seedPlanningIssue({ repoId, number: 2, size: null, status: "todo" });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: WEEK,
    });

    const plan = await weekPlan(WEEK);

    expect(plan.unassigned.committedMinutes).toBe(240);
    expect(plan.unassigned.issues.map((issue) => issue.number)).toEqual([1]);
    expect(plan.lanes[0].committedMinutes).toBe(0);
    expect(plan.unestimated.map((issue) => issue.number)).toEqual([2]);
  });

  test("inactive maintainers get no lane and their work is unassigned", async () => {
    usePlanning([maintainer("ann", 600, false)]);
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({
      repoId,
      number: 1,
      size: "md",
      assignees: [planningUser("ann")],
    });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: WEEK,
    });

    const plan = await weekPlan(WEEK);

    expect(plan.lanes).toEqual([]);
    expect(plan.unassigned.committedMinutes).toBe(240);
  });

  test("a week outside the planned set is empty", async () => {
    const plan = await weekPlan("2026-11-02");

    expect(plan.lanes).toHaveLength(1);
    expect(plan.lanes[0]).toMatchObject({ capMinutes: 360, committedMinutes: 0 });
    expect(plan.unassigned).toEqual({ committedMinutes: 0, issues: [] });
    expect(plan.unestimated).toEqual([]);
  });

  test("test_closed_and_pruned_plans_free_capacity", async () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({
      repoId,
      number: 1,
      size: "md",
      state: "closed",
      assignees: [planningUser("ann")],
    });
    seedPlanningIssue({
      repoId,
      number: 2,
      size: "lg",
      assignees: [planningUser("ann")],
    });
    for (const issueNumber of [1, 2]) {
      setPlanItem({ org: "orgA", name: "core", issueNumber, weekStart: WEEK });
    }

    const afterClose = await weekPlan(WEEK);
    expect(afterClose.lanes[0]).toMatchObject({
      committedMinutes: 480,
      remainingMinutes: -120,
      over: true,
    });
    expect(afterClose.lanes[0].issues.map((issue) => issue.number)).toEqual([2]);

    // The durable row survives, but pruning the mirror frees its capacity.
    clearMirror();
    const pruned = await weekPlan(WEEK);
    expect(pruned.lanes[0]).toMatchObject({ committedMinutes: 0, over: false });
    expect(pruned.lanes[0].issues).toEqual([]);
    expect(pruned.unassigned).toEqual({ committedMinutes: 0, issues: [] });
  });

  test("test_lane_issue_indexes_map_back", async () => {
    const repoId = seedPlanningRepo("orgA/core");
    const seeds: Omit<PlanningIssueSeed, "repoId">[] = [
      { number: 1, size: "md", assignees: [planningUser("ann")] },
      { number: 2, size: "lg", assignees: [planningUser("ann")] },
      {
        number: 3,
        size: "sm",
        assignees: [planningUser("ann"), planningUser("bob")],
      },
      { number: 4, size: "md", assignees: [] },
    ];
    for (const seed of seeds) {
      seedPlanningIssue({ repoId, ...seed });
      setPlanItem({
        org: "orgA",
        name: "core",
        issueNumber: seed.number,
        weekStart: WEEK,
      });
    }
    usePlanning([maintainer("ann", 600), maintainer("bob", 600)]);

    const plan = await weekPlan(WEEK);

    expect(plan.lanes.map((lane) => lane.maintainer.login)).toEqual([
      "ann",
      "bob",
    ]);
    expect(plan.lanes[0]).toMatchObject({
      capMinutes: 360,
      committedMinutes: 780,
      over: true,
    });
    expect(plan.lanes[0].issues.map((issue) => issue.number)).toEqual([1, 2, 3]);
    expect(plan.lanes[1]).toMatchObject({
      capMinutes: 360,
      committedMinutes: 60,
      over: false,
    });
    expect(plan.lanes[1].issues.map((issue) => issue.number)).toEqual([3]);
    expect(plan.unassigned.committedMinutes).toBe(240);
    expect(plan.unassigned.issues.map((issue) => issue.number)).toEqual([4]);
  });
});
