import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateSetting } from "#lib/server/db/schema";
import type { MaintainerInput } from "#lib/server/settings/store";
import {
  planningUser,
  resetPlanning,
  seedPlanningIssue,
  seedPlanningRepo,
} from "#tests/planning-helpers";
import { scheduleIssue, unscheduleIssue } from "./mutations";
import { getPlanItem, listPlanItems, setPlanItem } from "./store";

const WEEK = "2026-10-19";
const NEXT = "2026-10-26";

function rosterRow(
  login: string,
  overrides: Partial<MaintainerInput> = {},
): MaintainerInput {
  return {
    forge: "github",
    instance: "github.com",
    external_id: login,
    login,
    avatar_url: null,
    weekly_minutes: 600,
    active: true,
    ...overrides,
  };
}

/** Write the maintainer roster straight to settings (the store's read path). */
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

function seedAnnIssue(
  repoId: number,
  number: number,
  seed: { size?: string | null; state?: "open" | "closed"; assignee?: string | null } = {},
): void {
  const assignee = seed.assignee === null ? null : (seed.assignee ?? "ann");
  seedPlanningIssue({
    repoId,
    number,
    size: seed.size === undefined ? "md" : seed.size,
    state: seed.state ?? "open",
    assignees: assignee === null ? [] : [planningUser(assignee)],
  });
}

function schedule(number: number, weekStart: string = WEEK) {
  return scheduleIssue({ org: "orgA", name: "core", issueNumber: number, weekStart });
}

beforeEach(() => {
  resetPlanning();
  clearPlanningSettings();
  setMaintainers([rosterRow("ann")]);
});

afterAll(() => {
  clearPlanningSettings();
});

describe("scheduleIssue", () => {
  test("test_over_cap_409", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1);
    seedAnnIssue(repoId, 2);

    expect(schedule(1)).toEqual({ ok: true });

    const second = schedule(2);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
      expect(second.violations).toEqual([
        { login: "ann", capMinutes: 360, committedMinutes: 480, excessMinutes: 120 },
      ]);
    }
    expect(listPlanItems()).toHaveLength(1);
  });

  test("test_unestimated_rejected", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1, { size: null });

    const result = schedule(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(listPlanItems()).toHaveLength(0);
  });

  test("test_move_frees_old_week", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1);
    seedAnnIssue(repoId, 2);

    expect(schedule(1)).toEqual({ ok: true });
    expect(schedule(2).ok).toBe(false);

    expect(schedule(1, NEXT)).toEqual({ ok: true });
    expect(getPlanItem("orgA", "core", 1)?.weekStart).toBe(NEXT);

    expect(schedule(2)).toEqual({ ok: true });
    expect(getPlanItem("orgA", "core", 2)?.weekStart).toBe(WEEK);
  });

  test("test_failed_move_writes_nothing", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1);
    seedAnnIssue(repoId, 2);

    expect(schedule(1)).toEqual({ ok: true });
    expect(schedule(2, NEXT)).toEqual({ ok: true });

    const moved = schedule(1, NEXT);
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.status).toBe(409);
    expect(getPlanItem("orgA", "core", 1)?.weekStart).toBe(WEEK);
    expect(getPlanItem("orgA", "core", 2)?.weekStart).toBe(NEXT);
  });

  test("test_same_login_other_instance_is_not_affected", () => {
    const repoId = seedPlanningRepo("orgA/core");
    // A maintainer on another forge instance shares ann's login but not her
    // identity; their over-cap lane must not reject ann's schedule.
    seedPlanningIssue({
      repoId,
      number: 1,
      size: "lg",
      assignees: [
        {
          id: 0,
          externalId: "ann",
          forge: "ghe",
          instance: "ghe.example",
          login: "ann",
          avatarUrl: "",
          url: "",
        },
      ],
    });
    seedAnnIssue(repoId, 2);
    setMaintainers([
      rosterRow("ann", {
        forge: "ghe",
        instance: "ghe.example",
        weekly_minutes: 500,
      }),
      rosterRow("ann"),
    ]);
    // Simulate a roster/size change after scheduling: ghe/ann is already over.
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: WEEK,
    });

    expect(schedule(2)).toEqual({ ok: true });
    expect(getPlanItem("orgA", "core", 2)?.weekStart).toBe(WEEK);
  });

  test("test_same_week_is_noop", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1);

    expect(schedule(1)).toEqual({ ok: true });
    expect(schedule(1)).toEqual({ ok: true });

    const rows = listPlanItems();
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStart).toBe(WEEK);
  });

  test("rejects a week that is not a Monday", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1);

    const result = schedule(1, "2026-10-20");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toContain("Monday");
    }
    expect(listPlanItems()).toHaveLength(0);
  });

  test("404s when the issue is not mirrored", () => {
    seedPlanningRepo("orgA/core");

    const result = schedule(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  test("rejects a closed issue", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1, { state: "closed" });

    const result = schedule(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(listPlanItems()).toHaveLength(0);
  });

  test("rejects an unknown size label", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1, { size: "xl" });

    const result = schedule(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  test("rejects an issue with no active maintainer assignee", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1, { assignee: "zoe" });

    const unowned = schedule(1);
    expect(unowned.ok).toBe(false);
    if (!unowned.ok) {
      expect(unowned.status).toBe(400);
      expect(unowned.message.toLowerCase()).toContain("maintainer");
    }
    expect(listPlanItems()).toHaveLength(0);

    setMaintainers([rosterRow("ann"), rosterRow("zoe", { active: false })]);
    const inactive = schedule(1);
    expect(inactive.ok).toBe(false);
    if (!inactive.ok) expect(inactive.status).toBe(400);
    expect(listPlanItems()).toHaveLength(0);
  });
});

describe("unscheduleIssue", () => {
  test("clears the plan item idempotently", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedAnnIssue(repoId, 1);
    schedule(1);

    expect(unscheduleIssue({ org: "orgA", name: "core", issueNumber: 1 })).toBe(true);
    expect(getPlanItem("orgA", "core", 1)).toBeUndefined();
    expect(unscheduleIssue({ org: "orgA", name: "core", issueNumber: 1 })).toBe(false);
  });
});
