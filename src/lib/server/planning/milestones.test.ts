import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { setPlanItem } from "#lib/server/planning/store";
import type { MaintainerInput } from "#lib/server/settings/store";
import {
  planningMilestone,
  planningUser,
  resetPlanning,
  seedMilestones,
  seedPlanningIssue,
  seedPlanningRepo,
} from "#tests/planning-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { milestonePlans } from "./milestones";

const NOW = "2026-10-19";

function maintainer(login: string, weeklyMinutes: number): MaintainerInput {
  return {
    forge: "github",
    instance: "github.com",
    external_id: login,
    login,
    avatar_url: `https://avatars/${login}.png`,
    weekly_minutes: weeklyMinutes,
    active: true,
  };
}

function usePlanning(maintainers: MaintainerInput[] = []): void {
  setConfig({
    ...TEST_CONFIG,
    planning: { ...TEST_CONFIG.planning, maintainers },
  });
}

describe("milestone plans", () => {
  beforeEach(() => {
    resetPlanning();
    usePlanning([maintainer("ann", 600)]);
  });

  test("test_due_window", async () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(1, {
        title: "v1",
        dueOn: Date.UTC(2026, 10, 2),
        openIssues: 1,
      }),
    ]);
    seedPlanningIssue({
      repoId,
      number: 1,
      size: "md",
      milestoneNumber: 1,
      assignees: [planningUser("ann")],
    });

    const [plan] = await milestonePlans(NOW);

    expect(plan).toMatchObject({
      repo: "orgA/core",
      number: 1,
      title: "v1",
      capacityWeeks: 2,
    });
    expect(plan.lanes[0]).toMatchObject({
      capMinutes: 720,
      committedMinutes: 240,
      remainingMinutes: 480,
      over: false,
    });
  });

  test("test_no_due_date_has_no_cap", async () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [planningMilestone(1, { dueOn: null, openIssues: 1 })]);
    seedPlanningIssue({
      repoId,
      number: 1,
      size: "md",
      milestoneNumber: 1,
      assignees: [planningUser("ann")],
    });

    const [plan] = await milestonePlans(NOW);

    expect(plan.capacityWeeks).toBeNull();
    expect(plan.lanes[0]).toMatchObject({
      capMinutes: 0,
      committedMinutes: 240,
      over: false,
    });
  });

  test("test_groups_by_repo_and_number", async () => {
    const core = seedPlanningRepo("orgA/core");
    const web = seedPlanningRepo("orgA/web");
    for (const repoId of [core, web]) {
      seedMilestones(repoId, [
        planningMilestone(1, { title: "Same title", openIssues: 1 }),
      ]);
      seedPlanningIssue({
        repoId,
        number: 1,
        title: "Same issue",
        size: "sm",
        milestoneNumber: 1,
        assignees: [planningUser("ann")],
      });
    }

    const plans = await milestonePlans(NOW);

    expect(plans).toHaveLength(2);
    expect(plans.map((plan) => plan.repo).sort()).toEqual([
      "orgA/core",
      "orgA/web",
    ]);
    expect(plans.map((plan) => plan.lanes[0].committedMinutes)).toEqual([
      120, 120,
    ]);
  });

  test("milestone plans include planned and unestimated issues", async () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [planningMilestone(2, { openIssues: 2 })]);
    seedPlanningIssue({
      repoId,
      number: 1,
      size: "sm",
      milestoneNumber: 2,
      assignees: [planningUser("ann")],
    });
    seedPlanningIssue({
      repoId,
      number: 2,
      size: null,
      milestoneNumber: 2,
    });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });

    const [plan] = await milestonePlans(NOW);

    expect(plan.unestimated.map((issue) => issue.number)).toEqual([2]);
    expect(plan.lanes[0].issues.map((issue) => issue.number)).toEqual([1]);
  });
});
