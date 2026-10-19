import { beforeEach, describe, expect, test } from "bun:test";
import { writePriorityInputs } from "#lib/funnel-metadata";
import { getIssueListItem } from "#lib/server/issues/queries";
import * as mirror from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import {
  getPriorityState,
  retiredPriorityConflict,
  setPriorityInputs,
} from "./priority";

const META = {
  status: null,
  size: null,
  blocked: false,
  labelConflict: false,
};

function seedRepo(): void {
  mirror.upsertRepo({ githubId: 1, org: "orgA", name: "core", archived: false });
}

function seedIssue(
  number = 1,
  overrides: Partial<mirror.IssueRecord> = {},
): void {
  mirror.upsertIssue(
    {
      githubId: 100 + number,
      repoId: 1,
      number,
      title: `Issue ${number}`,
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      createdAt: 1,
      updatedAt: 1,
      closedAt: null,
      labels: [],
      assignees: [],
      comments: [],
      ...overrides,
    },
    META,
  );
}

beforeEach(() => {
  clearMirror();
  seedRepo();
});

describe("priority seeding", () => {
  test("seeds a missing row from a retired p-label", () => {
    seedIssue(1, { labels: ["todo", "p1", "sm"] });

    expect(getPriorityState("orgA", "core", 1)).toMatchObject({
      impact: null,
      urgency: null,
      priority: "P1",
    });
  });

  test("prefers impact/urgency body metadata over the retired label", () => {
    seedIssue(1, {
      labels: ["p1"],
      body: writePriorityInputs("desc", { impact: 1, urgency: 1 }),
    });

    expect(getPriorityState("orgA", "core", 1)).toMatchObject({
      impact: 1,
      urgency: 1,
      priority: "P0",
    });
  });

  test("leaves an unassessed issue without a priority row", () => {
    seedIssue(1);
    expect(getPriorityState("orgA", "core", 1)).toBeUndefined();
    expect(getIssueListItem(1, 1)?.priority).toBeNull();
  });
});

describe("setPriorityInputs", () => {
  test("derives and persists the matrix value for both axes", () => {
    seedIssue(1);
    const state = setPriorityInputs("orgA", "core", 1, {
      impact: 2,
      urgency: 1,
    });

    expect(state).toMatchObject({ impact: 2, urgency: 1, priority: "P0" });
    expect(getIssueListItem(1, 1)).toMatchObject({
      impact: 2,
      urgency: 1,
      priority: "P0",
    });
  });

  test("a single axis uses the P3 fallback", () => {
    seedIssue(1);
    expect(
      setPriorityInputs("orgA", "core", 1, { impact: null, urgency: 2 }),
    ).toMatchObject({ priority: "P3" });
  });

  test("clearing both axes keeps a null row so a label cannot resurrect it", () => {
    seedIssue(1, { labels: ["p1"] });
    setPriorityInputs("orgA", "core", 1, { impact: null, urgency: null });
    expect(getPriorityState("orgA", "core", 1)?.priority).toBeNull();

    // A re-sync still carries the stale label, but must not overwrite the
    // deliberate "no priority" decision.
    seedIssue(1, { labels: ["p1"] });
    expect(getPriorityState("orgA", "core", 1)?.priority).toBeNull();
    expect(mirror.getIssue(1, 1)?.labelConflict).toBe(1);
  });
});

describe("retired labels", () => {
  test("an externally applied label disagrees with the derived value", () => {
    seedIssue(1);
    setPriorityInputs("orgA", "core", 1, { impact: 1, urgency: 1 });
    seedIssue(1, { labels: ["p3"] });

    expect(getPriorityState("orgA", "core", 1)?.priority).toBe("P0");
    expect(retiredPriorityConflict("orgA", "core", 1, ["p3"])).toBe(true);
    expect(mirror.getIssue(1, 1)?.labelConflict).toBe(1);
  });

  test("a matching label is stale but not a conflict", () => {
    seedIssue(1, { labels: ["p1"] });
    expect(retiredPriorityConflict("orgA", "core", 1, ["p1"])).toBe(false);
  });
});

describe("mirror pruning", () => {
  test("priority survives deleting and re-syncing the issue row", () => {
    seedIssue(1);
    setPriorityInputs("orgA", "core", 1, { impact: 1, urgency: 2 });

    mirror.deleteIssue(1, 1);
    expect(getIssueListItem(1, 1)).toBeUndefined();

    seedIssue(1, { labels: [] });
    expect(getIssueListItem(1, 1)).toMatchObject({
      impact: 1,
      urgency: 2,
      priority: "P0",
    });
  });
});
