import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PRIORITY,
  DEFAULT_PRIORITY_MATRIX,
  IMPACT_SCALE,
  IMPACT_VALUES,
  PRIORITY_VALUES,
  URGENCY_SCALE,
  URGENCY_VALUES,
  derivePriority,
  isPriorityMatrix,
  parseImpact,
  parseUrgency,
  priorityRank,
  resolvePriorityRules,
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
