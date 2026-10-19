import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PRIORITY,
  DEFAULT_PRIORITY_MATRIX,
  IMPACT_SCALE,
  IMPACT_VALUES,
  PRIORITY_SCALE,
  PRIORITY_VALUES,
  RETIRED_PRIORITY_LABELS,
  URGENCY_SCALE,
  URGENCY_VALUES,
  derivePriority,
  derivePriorityOrNull,
  isPriorityMatrix,
  isRetiredPriorityLabel,
  legacyPriorityFromLabels,
  parseImpact,
  parseUrgency,
  priorityMeta,
  priorityRank,
  resolvePriorityRules,
  retiredPriority,
  type Impact,
  type PriorityMatrix,
  type Urgency,
} from "./priority";

describe("scales", () => {
  test("both axes are the fixed 1-4 set with written definitions", () => {
    expect([...IMPACT_VALUES]).toEqual([1, 2, 3, 4]);
    expect([...URGENCY_VALUES]).toEqual([1, 2, 3, 4]);
    expect(IMPACT_SCALE.map((level) => level.value)).toEqual([...IMPACT_VALUES]);
    expect(URGENCY_SCALE.map((level) => level.value)).toEqual([...URGENCY_VALUES]);
    for (const level of [...IMPACT_SCALE, ...URGENCY_SCALE]) {
      expect(level.name.length).toBeGreaterThan(0);
      expect(level.definition.length).toBeGreaterThan(0);
    }
  });

  test("parses metadata values without accepting out-of-range numbers", () => {
    expect(parseImpact("2")).toBe(2);
    expect(parseImpact(3)).toBe(3);
    expect(parseImpact(0)).toBeNull();
    expect(parseImpact(5)).toBeNull();
    expect(parseUrgency("4")).toBe(4);
    expect(parseUrgency("nope")).toBeNull();
    expect(parseUrgency(null)).toBeNull();
  });
});

describe("derivePriority", () => {
  test("looks up every impact/urgency pair in the published matrix", () => {
    for (const impact of IMPACT_VALUES) {
      for (const urgency of URGENCY_VALUES) {
        expect(derivePriority(impact, urgency)).toBe(
          DEFAULT_PRIORITY_MATRIX[impact][urgency],
        );
      }
    }
  });

  test("uses P3 when either axis is unset or invalid", () => {
    expect(DEFAULT_PRIORITY).toBe("P3");
    expect(derivePriority(null, 1)).toBe("P3");
    expect(derivePriority(1, undefined)).toBe("P3");
    expect(derivePriority(9, 9)).toBe("P3");
    expect(derivePriority("1", "1")).toBe("P0");
  });

  test("priority never improves as either axis worsens", () => {
    for (const impact of IMPACT_VALUES) {
      for (const urgency of URGENCY_VALUES) {
        const rank = priorityRank(derivePriority(impact, urgency));
        if (impact < 4) {
          expect(rank).toBeLessThanOrEqual(
            priorityRank(derivePriority((impact + 1) as Impact, urgency)),
          );
        }
        if (urgency < 4) {
          expect(rank).toBeLessThanOrEqual(
            priorityRank(derivePriority(impact, (urgency + 1) as Urgency)),
          );
        }
      }
    }
  });

  test("accepts a per-instance matrix override", () => {
    const matrix: PriorityMatrix = {
      1: { 1: "P3", 2: "P3", 3: "P3", 4: "P3" },
      2: { 1: "P3", 2: "P3", 3: "P3", 4: "P3" },
      3: { 1: "P3", 2: "P3", 3: "P3", 4: "P3" },
      4: { 1: "P3", 2: "P3", 3: "P3", 4: "P3" },
    };
    expect(isPriorityMatrix(matrix)).toBe(true);
    expect(derivePriority(1, 1, matrix)).toBe("P3");
    expect(derivePriority(1, 1, { matrix, fallback: "P2" })).toBe("P3");
    expect(derivePriority(null, 1, { matrix, fallback: "P2" })).toBe("P2");
  });

  test("resolves partial rule overrides over the canonical defaults", () => {
    const rules = resolvePriorityRules();
    expect(rules.matrix).toBe(DEFAULT_PRIORITY_MATRIX);
    expect(rules.fallback).toBe(DEFAULT_PRIORITY);
    expect(resolvePriorityRules({ fallback: "P0" }).fallback).toBe("P0");
  });

  test("exposes the complete P0-P3 priority set", () => {
    const seen = new Set<string>();
    for (const impact of IMPACT_VALUES) {
      for (const urgency of URGENCY_VALUES) {
        seen.add(derivePriority(impact, urgency));
      }
    }
    expect([...seen].sort()).toEqual([...PRIORITY_VALUES].sort());
  });
});

describe("derivePriorityOrNull", () => {
  test("treats both unset axes as the empty priority state", () => {
    expect(derivePriorityOrNull(null, null)).toBeNull();
    expect(derivePriorityOrNull(undefined, undefined)).toBeNull();
  });

  test("keeps the matrix fallback when only one axis is missing", () => {
    expect(derivePriorityOrNull(null, 1)).toBe("P3");
    expect(derivePriorityOrNull(1, null)).toBe("P3");
    expect(derivePriorityOrNull(1, 1)).toBe("P0");
  });
});

describe("priority display metadata", () => {
  test("P0 is the Urgent token and every tier has a colour", () => {
    expect(priorityMeta("P0")).toMatchObject({
      value: "P0",
      name: "Urgent",
      urgent: true,
      color: "f87171",
    });
    expect(priorityMeta("p2")?.name).toBe("Medium");
    for (const level of PRIORITY_SCALE) {
      expect(level.color).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  test("unknown priorities have no metadata", () => {
    expect(priorityMeta("p9")).toBeNull();
    expect(priorityMeta(null)).toBeNull();
  });
});

describe("retired priority labels", () => {
  test("maps p1-p3 to their derived tiers", () => {
    expect(RETIRED_PRIORITY_LABELS).toEqual({ p1: "P1", p2: "P2", p3: "P3" });
    expect(retiredPriority("P1")).toBe("P1");
    expect(retiredPriority("p3")).toBe("P3");
    expect(retiredPriority("p0")).toBeNull();
    expect(isRetiredPriorityLabel("p2")).toBe(true);
    expect(isRetiredPriorityLabel("todo")).toBe(false);
  });

  test("picks the canonical tier when several retired labels remain", () => {
    expect(legacyPriorityFromLabels(["todo", "p3", "p1"])).toBe("P1");
    expect(legacyPriorityFromLabels(["todo"])).toBeNull();
  });
});
