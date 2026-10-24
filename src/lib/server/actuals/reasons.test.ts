import { describe, expect, test } from "bun:test";
import {
  DELAY_REASONS,
  isDelayReason,
  normalizeDelayReason,
} from "./reasons";

describe("delay reasons", () => {
  test("lists exactly the six canonical reasons", () => {
    expect(DELAY_REASONS).toEqual([
      "dependency",
      "info",
      "review",
      "external",
      "capacity",
      "other",
    ]);
  });

  test("recognises each canonical reason", () => {
    for (const reason of DELAY_REASONS) expect(isDelayReason(reason)).toBe(true);
  });

  test("rejects anything else", () => {
    for (const value of ["", "blocked", "Dependency", null, undefined, 1, {}]) {
      expect(isDelayReason(value)).toBe(false);
    }
  });

  test("normalises unknown values to other", () => {
    expect(normalizeDelayReason("capacity")).toBe("capacity");
    expect(normalizeDelayReason("nonsense")).toBe("other");
    expect(normalizeDelayReason(undefined)).toBe("other");
    expect(normalizeDelayReason(null)).toBe("other");
  });
});
