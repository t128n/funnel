import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { statePlanItem } from "#lib/server/db/schema";
import { clearMirror } from "#tests/mirror-helpers";
import {
  resetPlanning,
  seedPlanningIssue,
  seedPlanningRepo,
} from "#tests/planning-helpers";
import {
  clearPlanItem,
  getPlanItem,
  listPlanItems,
  setPlanItem,
} from "./store";

describe("plan item store", () => {
  beforeEach(() => {
    resetPlanning();
  });

  test("test_plan_item_unique_per_issue", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({ repoId, number: 1, size: "md" });

    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-26",
    });

    const rows = listPlanItems();
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStart).toBe("2026-10-26");
    expect(getPlanItem("orgA", "core", 1)?.weekStart).toBe("2026-10-26");

    // Pin `created_at` to a value no write could produce, so the move's
    // preservation of it cannot pass just because both writes shared a
    // millisecond.
    db.update(statePlanItem)
      .set({ createdAt: 1 })
      .where(eq(statePlanItem.issueNumber, 1))
      .run();
    const moved = setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-11-02",
    });
    expect(moved.createdAt).toBe(1);
    expect(moved.weekStart).toBe("2026-11-02");
  });

  test("test_plan_items_survive_mirror_clear", () => {
    const repoId = seedPlanningRepo("orgA/core");
    seedPlanningIssue({ repoId, number: 1, size: "md" });
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });

    clearMirror();

    expect(getPlanItem("orgA", "core", 1)).toMatchObject({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });
  });

  test("listPlanItems filters by week and range", () => {
    for (const [number, weekStart] of [
      [1, "2026-10-12"],
      [2, "2026-10-19"],
      [3, "2026-10-26"],
    ] as const) {
      setPlanItem({ org: "orgA", name: "core", issueNumber: number, weekStart });
    }

    expect(listPlanItems({ weekStart: "2026-10-19" })).toHaveLength(1);
    expect(
      listPlanItems({ from: "2026-10-19", to: "2026-11-01" }).map(
        (row) => row.issueNumber,
      ),
    ).toEqual([2, 3]);
  });

  test("clearPlanItem is idempotent", () => {
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: "2026-10-19",
    });

    expect(clearPlanItem("orgA", "core", 1)).toBe(true);
    expect(clearPlanItem("orgA", "core", 1)).toBe(false);
    expect(getPlanItem("orgA", "core", 1)).toBeUndefined();
  });
});
