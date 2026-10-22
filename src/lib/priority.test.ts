import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PRIORITY,
  DEFAULT_PRIORITY_MATRIX,
  IMPACT_LABELS,
  IMPACT_LABEL_VALUES,
  IMPACT_SCALE,
  IMPACT_VALUES,
  PRIORITY_SCALE,
  PRIORITY_VALUES,
  RETIRED_PRIORITY_LABELS,
  URGENCY_LABELS,
  URGENCY_LABEL_VALUES,
  URGENCY_SCALE,
  URGENCY_VALUES,
  derivePriority,
  derivePriorityOrNull,
  impactLabel,
  isImpact,
  isPriorityMatrix,
  isRetiredPriorityLabel,
  legacyPriorityFromLabels,
  parseImpact,
  parseImpactLabel,
  parseUrgency,
  parseUrgencyLabel,
  priorityMeta,
  priorityRank,
  resolvePriorityRules,
  retiredPriority,
  retiredPriorityConflict,
  urgencyLabel,
  type Impact,
  type PriorityMatrix,
  type Urgency,
} from "./priority";

describe("scales", () => {
  test("both axes have exactly three levels with written definitions", () => {
    expect([...IMPACT_VALUES]).toEqual([1, 2, 3]);
    expect([...URGENCY_VALUES]).toEqual([1, 2, 3]);
    expect(IMPACT_SCALE.map((level) => level.value)).toEqual([...IMPACT_VALUES]);
    expect(URGENCY_SCALE.map((level) => level.value)).toEqual([...URGENCY_VALUES]);
    for (const level of [...IMPACT_SCALE, ...URGENCY_SCALE]) {
      expect(level.name.length).toBeGreaterThan(0);
      expect(level.definition.length).toBeGreaterThan(0);
    }
  });

  test("maps levels to their canonical GitHub labels", () => {
    expect(IMPACT_LABEL_VALUES).toEqual(["sev", "mod", "min"]);
    expect(URGENCY_LABEL_VALUES).toEqual(["high", "mid", "low"]);
    expect(impactLabel(1)).toBe("sev");
    expect(impactLabel("3")).toBe("min");
    expect(urgencyLabel(2)).toBe("mid");
    expect(parseImpactLabel("MIN")).toBe(3);
    expect(parseUrgencyLabel("high")).toBe(1);
    expect(parseImpactLabel("nope")).toBeNull();
  });

  test("parses metadata values without accepting out-of-range numbers", () => {
    expect(parseImpact("2")).toBe(2);
    expect(parseImpact(3)).toBe(3);
    expect(parseImpact(0)).toBeNull();
    expect(parseImpact(4)).toBeNull();
    expect(parseUrgency("1")).toBe(1);
    expect(parseUrgency("nope")).toBeNull();
    expect(isImpact(2)).toBe(true);
    expect(isImpact(4)).toBe(false);
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

  test("uses the fallback when either axis is unset or invalid", () => {
    expect(DEFAULT_PRIORITY).toBe("P3");
    expect(derivePriority(null, 1)).toBe("P3");
    expect(derivePriority(1, undefined)).toBe("P3");
    expect(derivePriority(9, 9)).toBe("P3");
    expect(derivePriority("1", "1")).toBe("P1");
  });

  test("priority never improves as either axis worsens", () => {
    for (const impact of IMPACT_VALUES) {
      for (const urgency of URGENCY_VALUES) {
        const rank = priorityRank(derivePriority(impact, urgency));
        if (impact < 3) {
          expect(rank).toBeLessThanOrEqual(
            priorityRank(derivePriority((impact + 1) as Impact, urgency)),
          );
        }
        if (urgency < 3) {
          expect(rank).toBeLessThanOrEqual(
            priorityRank(derivePriority(impact, (urgency + 1) as Urgency)),
          );
        }
      }
    }
  });

  test("accepts a per-instance matrix override", () => {
    const matrix: PriorityMatrix = {
      1: { 1: "P3", 2: "P3", 3: "P3" },
      2: { 1: "P3", 2: "P3", 3: "P3" },
      3: { 1: "P3", 2: "P3", 3: "P3" },
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
    expect(resolvePriorityRules({ fallback: "P1" }).fallback).toBe("P1");
  });

  test("exposes the complete P1-P3 priority set", () => {
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
    expect(derivePriorityOrNull(1, 1)).toBe("P1");
  });
});

describe("priority display metadata", () => {
  test("P1 is High and every tier has a colour", () => {
    expect(priorityMeta("P1")).toMatchObject({
      value: "P1",
      name: "High",
      color: "fb923c",
    });
    expect(priorityMeta("p2")?.name).toBe("Medium");
    expect(priorityMeta("P3")?.name).toBe("Low");
    for (const level of PRIORITY_SCALE) {
      expect(level.color).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  test("unknown priorities have no metadata", () => {
    expect(priorityMeta("P9")).toBeNull();
    expect(priorityMeta(null)).toBeNull();
  });
});

describe("retired priority labels", () => {
  test("maps p1-p3 to their tiers", () => {
    expect(RETIRED_PRIORITY_LABELS).toEqual({ p1: "P1", p2: "P2", p3: "P3" });
    expect(retiredPriority("P1")).toBe("P1");
    expect(retiredPriority("p3")).toBe("P3");
    expect(isRetiredPriorityLabel("p2")).toBe(true);
    expect(isRetiredPriorityLabel("todo")).toBe(false);
  });

  test("picks the canonical tier when several retired labels remain", () => {
    expect(legacyPriorityFromLabels(["todo", "p3", "p1"])).toBe("P1");
    expect(legacyPriorityFromLabels(["todo"])).toBeNull();
  });

  test("flags a retired label that disagrees with the derived value", () => {
    expect(retiredPriorityConflict("P1", ["p1"])).toBe(false);
    expect(retiredPriorityConflict("P1", ["p3"])).toBe(true);
    expect(retiredPriorityConflict("P1", ["p1", "p2"])).toBe(true);
    expect(retiredPriorityConflict(null, ["p1"])).toBe(true);
    expect(retiredPriorityConflict("P1", ["todo"])).toBe(false);
  });
});
