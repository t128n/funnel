import { beforeEach, describe, expect, test } from "bun:test";
import { setPlanItem } from "#lib/server/planning/store";
import {
  planningMilestone,
  resetPlanning,
  seedMilestones,
  seedPlanningIssue,
  seedPlanningRepo,
  seedRepoAssignees,
  planningUser,
} from "#tests/planning-helpers";
import {
  getPlanningIssue,
  listAssigneeCandidates,
  listMilestoneIssues,
  listPlanCandidates,
  listPlannedIssues,
  PLAN_CANDIDATE_LIMIT,
} from "./queries";

describe("planning queries", () => {
  beforeEach(() => {
    resetPlanning();
  });

  test("test_planned_join", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({
      repoId,
      number: 1,
      title: "Issue 1",
      size: "md",
      assignees: [planningUser("ann")],
    });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });

    const issue = listPlannedIssues()[0];
    expect({
      repo: issue.repo,
      repoId: issue.repoId,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      size: issue.size,
      milestone: issue.milestone,
      priority: issue.priority,
      weekStart: issue.weekStart,
    }).toEqual({
      repo: "orgA/core",
      repoId: 1,
      number: 1,
      title: "Issue 1",
      state: "open",
      size: "md",
      milestone: null,
      priority: null,
      weekStart: "2026-10-19",
    });
    expect(issue.assignees).toMatchObject([{ login: "ann" }]);
  });

  test("test_candidates_exclude_planned_and_unsized", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({
      repoId,
      number: 1,
      title: "Planned",
      status: "todo",
      size: "md",
      priority: "P1",
    });
    seedPlanningIssue({
      repoId,
      number: 2,
      title: "Closed",
      state: "closed",
      status: "todo",
      size: "md",
      priority: "P1",
    });
    seedPlanningIssue({
      repoId,
      number: 3,
      title: "Unsized",
      status: "todo",
      size: null,
      priority: "P1",
    });
    seedPlanningIssue({
      repoId,
      number: 4,
      title: "Untriaged",
      status: null,
      size: "sm",
      priority: "P1",
    });
    seedPlanningIssue({
      repoId,
      number: 5,
      title: "Later",
      status: "todo",
      size: "lg",
      priority: "P3",
    });
    seedPlanningIssue({
      repoId,
      number: 6,
      title: "First",
      status: "todo",
      size: "sm",
      priority: "P1",
    });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });

    const candidates = listPlanCandidates();
    expect(candidates.map((issue) => issue.title)).toEqual(["First", "Later"]);
    expect(candidates.map((issue) => issue.weekStart)).toEqual([null, null]);
  });

  test("test_candidates_respect_limit", () => {
    const repoId = seedPlanningRepo("orgA/core");
    for (const number of [1, 2, 3]) {
      seedPlanningIssue({ repoId, number, status: "todo", size: "md" });
    }

    // The picker asks for a bounded page; most recently updated first.
    const limited = listPlanCandidates(2);
    expect(limited.map((issue) => issue.number)).toEqual([3, 2]);
    expect(PLAN_CANDIDATE_LIMIT).toBe(300);
  });

  test("test_closed_issue_is_absent", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({
      repoId,
      number: 1,
      title: "Closed",
      state: "closed",
      size: "md",
    });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });

    expect(listPlannedIssues()).toEqual([]);
    expect(getPlanningIssue("orgA", "core", 1)).toMatchObject({
      state: "closed",
      weekStart: "2026-10-19",
    });
  });

  test("unmirrored plan items are absent from planned lists", () => {
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 99,
      weekStart: "2026-10-19",
    });

    expect(listPlannedIssues()).toEqual([]);
    expect(getPlanningIssue("orgA", "core", 99)).toBeUndefined();
  });

  test("test_assignee_candidates_scoped", () => {
    const core = seedPlanningRepo("orgA/core");
    const web = seedPlanningRepo("orgA/web");
    seedRepoAssignees(core, [
      planningUser("ann"),
      planningUser("bob"),
    ]);
    seedRepoAssignees(web, [planningUser("cal")]);

    expect(
      listAssigneeCandidates(["orgA/core"]).map((user) => user.login),
    ).toEqual(["ann", "bob"]);
    expect(
      listAssigneeCandidates(["orgA/core", "orgA/web"]).map(
        (user) => user.login,
      ),
    ).toEqual(["ann", "bob", "cal"]);
  });

  test("milestone issues carry the milestone ref and weekStart", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(3, { title: "v1", dueOn: 1_800_000_000_000 }),
    ]);
    seedPlanningIssue({
      repoId,
      number: 1,
      size: "md",
      milestoneNumber: 3,
      assignees: [planningUser("ann")],
    });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });

    const issues = listMilestoneIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].milestone).toMatchObject({
      repo: "orgA/core",
      number: 3,
      title: "v1",
    });
    expect(issues[0].weekStart).toBe("2026-10-19");
  });
});
