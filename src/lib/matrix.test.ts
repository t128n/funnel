import { describe, expect, test } from "bun:test";
import {
  MATRIX_POSITIONS,
  defaultMatrixCell,
  matrixCellPriority,
  matrixCellValue,
  parseMatrixCell,
} from "#lib/matrix";
import { DEFAULT_PRIORITY_MATRIX } from "#lib/priority";

describe("matrixCellPriority", () => {
  test("matches the canonical impact × urgency lookup", () => {
    expect(MATRIX_POSITIONS).toHaveLength(9);
    for (const { impact, urgency } of MATRIX_POSITIONS) {
      expect(matrixCellPriority(impact, urgency).priority).toBe(
        DEFAULT_PRIORITY_MATRIX[impact][urgency],
      );
    }
    expect(matrixCellPriority(2, 3)).toMatchObject({
      priority: "P3",
      name: "Low",
      label: "P3 · Low",
    });
    expect(matrixCellPriority(1, 1)).toMatchObject({
      priority: "P1",
      name: "High",
      label: "P1 · High",
    });
  });
});

describe("parseMatrixCell", () => {
  test("accepts the nine assessed positions", () => {
    expect(parseMatrixCell("1-1")).toEqual({ impact: 1, urgency: 1 });
    expect(parseMatrixCell("2-3")).toEqual({ impact: 2, urgency: 3 });
    expect(parseMatrixCell("3-2")).toEqual({ impact: 3, urgency: 2 });
  });

  test("rejects partial, unassessed, and malformed values", () => {
    expect(parseMatrixCell("")).toBeNull();
    expect(parseMatrixCell(null)).toBeNull();
    expect(parseMatrixCell("0-1")).toBeNull();
    expect(parseMatrixCell("4-1")).toBeNull();
    expect(parseMatrixCell("1-null")).toBeNull();
    expect(parseMatrixCell("1-1-1")).toBeNull();
  });

  test("serializes back to the URL form", () => {
    expect(matrixCellValue(2, 3)).toBe("2-3");
  });
});

describe("defaultMatrixCell", () => {
  test("chooses the highest-priority populated cell", () => {
    expect(
      defaultMatrixCell([
        { impact: 2, urgency: 2, total: 4 },
        { impact: 1, urgency: 3, total: 1 },
      ]),
    ).toEqual({ impact: 1, urgency: 3 });
  });

  test("breaks priority ties by impact then urgency, not count", () => {
    expect(
      defaultMatrixCell([
        { impact: 1, urgency: 2, total: 50 },
        { impact: 1, urgency: 1, total: 1 },
      ]),
    ).toEqual({ impact: 1, urgency: 1 });

    expect(
      defaultMatrixCell([
        { impact: 2, urgency: 1, total: 50 },
        { impact: 1, urgency: 2, total: 1 },
      ]),
    ).toEqual({ impact: 1, urgency: 2 });
  });

  test("falls back to Severe impact / High urgency when every cell is empty", () => {
    expect(
      defaultMatrixCell([
        { impact: 1, urgency: 1, total: 0 },
        { impact: null, urgency: null, total: 8 },
      ]),
    ).toEqual({ impact: 1, urgency: 1 });
    expect(defaultMatrixCell([])).toEqual({ impact: 1, urgency: 1 });
  });
});
