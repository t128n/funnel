/**
 * Server projection tests for the milestone timeline.
 *
 * Dates are pinned with `Date.UTC` so the projection is asserted in UTC rather
 * than the host timezone. `resetPlanning` deliberately leaves
 * `state_issue_event` alone (events are durable actual-time history), so each
 * case clears it explicitly before seeding.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import { stateIssueEvent } from "#lib/server/db/schema";
import { setPlanItem } from "#lib/server/planning/store";
import {
  planningMilestone,
  resetPlanning,
  seedMilestones,
  seedPlanningEvent,
  seedPlanningIssue,
  seedPlanningRepo,
} from "#tests/planning-helpers";
import { milestoneTimeline, timelineWindow } from "./timeline";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Monday 19 Oct 2026 at 00:00 UTC. */
const MONDAY = Date.UTC(2026, 9, 19);
/** Monday 26 Oct 2026 at 00:00 UTC. */
const NEXT_MONDAY = Date.UTC(2026, 9, 26);
/** Monday 2 Nov 2026 at 00:00 UTC. */
const DUE = Date.UTC(2026, 10, 2);
/** A Thursday mid-morning, so padding cannot be confused with `now`. */
const NOW = Date.UTC(2026, 9, 22, 12);

function plan(
  slug: string,
  issueNumber: number,
  weekStart: string,
): void {
  const [org, name] = slug.split("/");
  setPlanItem({ org: org!, name: name!, issueNumber, weekStart });
}

function event(
  slug: string,
  issueNumber: number,
  at: number,
  toValue: "in-progress" | "in-review" | "todo" = "in-progress",
): void {
  const [org, name] = slug.split("/");
  seedPlanningEvent({
    org: org!,
    name: name!,
    issueNumber,
    kind: "status",
    toValue,
    at,
  });
}

describe("milestoneTimeline", () => {
  beforeEach(() => {
    db.delete(stateIssueEvent).run();
    resetPlanning();
  });

  test("plan week alone anchors the row at Monday 00:00 UTC", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(1, { title: "v1", dueOn: DUE, openIssues: 1 }),
    ]);
    seedPlanningIssue({
      repoId,
      number: 1,
      title: "Plan me",
      milestoneNumber: 1,
      status: "todo",
      priority: "P2",
    });
    plan("orgA/core", 1, "2026-10-19");

    const timeline = milestoneTimeline(new Date(NOW));

    expect(timeline.now).toBe(NOW);
    expect(timeline.rows).toHaveLength(1);
    const [row] = timeline.rows;
    expect(row!.startOn).toBe(MONDAY);
    expect(row!.startSource).toBe("plan");
    expect(row!.markers).toEqual([
      {
        repo: "orgA/core",
        number: 1,
        title: "Plan me",
        status: "todo",
        priority: "P2",
        blocked: false,
        at: MONDAY,
        source: "plan",
      },
    ]);
  });

  test("active transition alone anchors the row at the event instant", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [planningMilestone(1, { dueOn: DUE, openIssues: 1 })]);
    seedPlanningIssue({ repoId, number: 1, milestoneNumber: 1 });
    const startedAt = Date.UTC(2026, 9, 21, 14, 30);
    event("orgA/core", 1, startedAt);

    const [row] = milestoneTimeline(NOW).rows;

    expect(row!.startOn).toBe(startedAt);
    expect(row!.startSource).toBe("active");
    expect(row!.markers).toHaveLength(1);
    expect(row!.markers[0]).toMatchObject({ at: startedAt, source: "active" });
  });

  test("the earlier of plan and active wins and reports its source", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(1, {
        title: "Active first",
        dueOn: DUE,
        openIssues: 1,
      }),
      planningMilestone(2, {
        title: "Plan first",
        dueOn: DUE,
        openIssues: 1,
      }),
    ]);
    seedPlanningIssue({ repoId, number: 1, milestoneNumber: 1 });
    seedPlanningIssue({ repoId, number: 2, milestoneNumber: 2 });

    // Milestone 1: active on 12 Oct beats the 19 Oct plan week.
    plan("orgA/core", 1, "2026-10-19");
    event("orgA/core", 1, Date.UTC(2026, 9, 12));
    // Milestone 2: plan week on 19 Oct beats the 26 Oct transition.
    plan("orgA/core", 2, "2026-10-19");
    event("orgA/core", 2, NEXT_MONDAY);

    const { rows } = milestoneTimeline(NOW);
    const activeFirst = rows.find((row) => row.number === 1)!;
    const planFirst = rows.find((row) => row.number === 2)!;

    expect(activeFirst).toMatchObject({
      startOn: Date.UTC(2026, 9, 12),
      startSource: "active",
    });
    expect(planFirst).toMatchObject({
      startOn: MONDAY,
      startSource: "plan",
    });
    expect(planFirst.markers[0]).toMatchObject({
      at: MONDAY,
      source: "plan",
    });
  });

  test("an issue with no signal leaves the row but produces no marker", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [planningMilestone(1, { dueOn: DUE, openIssues: 1 })]);
    seedPlanningIssue({ repoId, number: 1, milestoneNumber: 1 });

    const { rows } = milestoneTimeline(NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      startOn: null,
      startSource: null,
      markers: [],
    });
  });

  test("a milestone without a due date is undated and never widens the window", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(1, { title: "No date", dueOn: null, openIssues: 1 }),
      planningMilestone(2, { title: "Dated", dueOn: DUE, openIssues: 0 }),
    ]);
    seedPlanningIssue({ repoId, number: 1, milestoneNumber: 1 });
    // An old plan week on the undated milestone must not pull the window back.
    plan("orgA/core", 1, "2020-01-06");

    const timeline = milestoneTimeline(NOW);

    expect(timeline.rows.map((row) => row.number)).toEqual([2]);
    expect(timeline.undated.map((row) => row.number)).toEqual([1]);
    expect(timeline.undated[0]!.startOn).toBe(Date.UTC(2020, 0, 6));
    expect(timeline.window).not.toBeNull();
    expect(timeline.window!.start).toBe(Date.UTC(2026, 9, 12));

    // With only undated milestones there is no window at all.
    seedMilestones(repoId, [
      planningMilestone(1, { title: "No date", dueOn: null, openIssues: 1 }),
    ]);
    const onlyUndated = milestoneTimeline(NOW);
    expect(onlyUndated.rows).toEqual([]);
    expect(onlyUndated.undated).toHaveLength(1);
    expect(onlyUndated.window).toBeNull();
  });

  test("progress comes from the mirror counts, including an empty milestone", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(1, {
        title: "Half done",
        dueOn: DUE,
        openIssues: 2,
        closedIssues: 1,
      }),
      planningMilestone(2, {
        title: "Empty",
        dueOn: NEXT_MONDAY,
        openIssues: 0,
        closedIssues: 0,
      }),
    ]);

    const { rows } = milestoneTimeline(NOW);
    const half = rows.find((row) => row.number === 1)!;
    const empty = rows.find((row) => row.number === 2)!;

    expect(half).toMatchObject({
      openIssues: 2,
      closedIssues: 1,
      progress: 1 / 3,
      markers: [],
    });
    expect(empty).toMatchObject({
      openIssues: 0,
      closedIssues: 0,
      progress: 0,
    });
  });

  test("markers exclude closed child issues even when they have signals", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(1, { dueOn: DUE, openIssues: 1, closedIssues: 1 }),
    ]);
    seedPlanningIssue({ repoId, number: 1, milestoneNumber: 1 });
    seedPlanningIssue({
      repoId,
      number: 2,
      milestoneNumber: 1,
      state: "closed",
      stateReason: "completed",
    });
    plan("orgA/core", 1, "2026-10-19");
    // The closed child has the earliest signal and must still be ignored.
    plan("orgA/core", 2, "2026-10-12");
    event("orgA/core", 2, Date.UTC(2026, 9, 5));

    const [row] = milestoneTimeline(NOW).rows;

    expect(row!.markers.map((marker) => marker.number)).toEqual([1]);
    expect(row!.startOn).toBe(MONDAY);
  });

  test("markers sort by anchor instant then issue number", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [planningMilestone(1, { dueOn: DUE, openIssues: 3 })]);
    for (const number of [1, 2, 3]) {
      seedPlanningIssue({ repoId, number, milestoneNumber: 1 });
    }
    plan("orgA/core", 3, "2026-10-19");
    plan("orgA/core", 1, "2026-10-19");
    plan("orgA/core", 2, "2026-10-26");

    const [row] = milestoneTimeline(NOW).rows;

    expect(row!.markers.map((marker) => marker.number)).toEqual([1, 3, 2]);
  });

  test("rows sort by due date then repo then number; undated by repo then number", () => {
    const core = seedPlanningRepo("orgA/core");
    const web = seedPlanningRepo("orgB/web");
    seedMilestones(core, [
      planningMilestone(2, { title: "Late", dueOn: Date.UTC(2026, 10, 9) }),
      planningMilestone(1, { title: "First", dueOn: DUE }),
      planningMilestone(5, { title: "Undated five", dueOn: null }),
    ]);
    seedMilestones(web, [
      planningMilestone(1, { title: "Other repo first", dueOn: DUE }),
      planningMilestone(3, { title: "Undated three", dueOn: null }),
      planningMilestone(2, { title: "Undated two", dueOn: null }),
    ]);

    const timeline = milestoneTimeline(NOW);

    expect(
      timeline.rows.map((row) => `${row.repo}#${row.number}`),
    ).toEqual(["orgA/core#1", "orgB/web#1", "orgA/core#2"]);
    expect(
      timeline.undated.map((row) => `${row.repo}#${row.number}`),
    ).toEqual(["orgA/core#5", "orgB/web#2", "orgB/web#3"]);
  });

  test("repo filter narrows rows but repos keeps every open-milestone repo", () => {
    const core = seedPlanningRepo("orgA/core");
    const web = seedPlanningRepo("orgB/web");
    seedMilestones(core, [
      planningMilestone(1, { dueOn: DUE }),
      planningMilestone(2, { dueOn: null }),
    ]);
    seedMilestones(web, [planningMilestone(1, { dueOn: NEXT_MONDAY })]);

    const filtered = milestoneTimeline(NOW, { repo: "orgA/core" });

    expect(filtered.repos).toEqual(["orgA/core", "orgB/web"]);
    expect(filtered.rows.map((row) => row.repo)).toEqual(["orgA/core"]);
    expect(filtered.undated.map((row) => row.repo)).toEqual(["orgA/core"]);
    expect(filtered.window).not.toBeNull();

    const missing = milestoneTimeline(NOW, { repo: "orgZ/none" });
    expect(missing.repos).toEqual(["orgA/core", "orgB/web"]);
    expect(missing.rows).toEqual([]);
    expect(missing.undated).toEqual([]);
    expect(missing.window).toBeNull();
  });

  test("a plan week after the due date is preserved, not clamped", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(1, { title: "Late start", dueOn: DUE, openIssues: 1 }),
    ]);
    seedPlanningIssue({ repoId, number: 1, milestoneNumber: 1 });
    const lateWeek = Date.UTC(2026, 11, 7);
    plan("orgA/core", 1, "2026-12-07");

    const [row] = milestoneTimeline(NOW).rows;

    expect(row!.dueOn).toBe(DUE);
    expect(row!.startOn).toBe(lateWeek);
    expect(row!.startOn).toBeGreaterThan(row!.dueOn!);
    expect(row!.startSource).toBe("plan");
    expect(row!.markers[0]!.at).toBe(lateWeek);
  });

  test("closed milestones stay off the view", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedMilestones(repoId, [
      planningMilestone(1, {
        title: "Shipped",
        state: "closed",
        dueOn: DUE,
        openIssues: 0,
      }),
    ]);

    const timeline = milestoneTimeline(NOW);

    expect(timeline.rows).toEqual([]);
    expect(timeline.undated).toEqual([]);
    expect(timeline.repos).toEqual([]);
    expect(timeline.window).toBeNull();
  });
});

describe("timelineWindow", () => {
  test("snaps to Monday, includes now, pads a week and spans at least 8 weeks", () => {
    const window = timelineWindow(
      [{ startOn: MONDAY, dueOn: DUE }],
      NOW,
    )!;

    expect(new Date(window.start).getUTCDay()).toBe(1);
    expect(new Date(window.end).getUTCDay()).toBe(1);
    expect(window.start % DAY_MS).toBe(0);
    expect(window.end % DAY_MS).toBe(0);
    expect(window.start).toBeLessThanOrEqual(NOW);
    expect(window.end).toBeGreaterThan(NOW);
    expect(window.start).toBe(Date.UTC(2026, 9, 12));
    expect(window.end - window.start).toBeGreaterThanOrEqual(8 * WEEK_MS);
    expect(window.end).toBe(Date.UTC(2026, 11, 7));
  });

  test("a long span keeps exactly one padded week on each side", () => {
    const due = Date.UTC(2027, 1, 1);
    const window = timelineWindow([{ startOn: MONDAY, dueOn: due }], NOW)!;

    expect(window.start).toBe(Date.UTC(2026, 9, 12));
    expect(window.end).toBe(Date.UTC(2027, 1, 8));
  });

  test("returns null when no row has a due date", () => {
    expect(timelineWindow([], NOW)).toBeNull();
    expect(timelineWindow([{ startOn: MONDAY, dueOn: null }], NOW)).toBeNull();
  });

  test("uses the due date when a row has no start", () => {
    const window = timelineWindow([{ startOn: null, dueOn: DUE }], NOW)!;

    expect(window.start).toBe(Date.UTC(2026, 9, 12));
    expect(window.end).toBeGreaterThanOrEqual(DUE + WEEK_MS);
  });
});
