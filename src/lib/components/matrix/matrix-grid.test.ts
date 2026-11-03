import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { moveMatrixCell } from "./matrix-grid";
import { matrixGrid } from "#lib/components/matrix/matrix-grid";

describe("matrixGrid", () => {
  test("lays out three impact rows by three urgency columns", () => {
    const rows = matrixGrid({
      cells: [],
      total: 0,
      rated: 0,
      needsAssessment: 0,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveLength(3);
    expect(rows[0][0]).toMatchObject({ impact: 1, urgency: 1, total: 0 });
    expect(rows[2][2]).toMatchObject({ impact: 3, urgency: 3, total: 0 });
  });

  test("reads counts from the board and derives each priority", () => {
    const rows = matrixGrid({
      cells: [
        { impact: 1, urgency: 1, total: 2 },
        { impact: 2, urgency: 3, total: 4 },
        { impact: 3, urgency: 2, total: 1 },
      ],
      total: 7,
      rated: 7,
      needsAssessment: 0,
    });
    expect(rows[0][0]).toMatchObject({ total: 2, priority: "P1", name: "High" });
    expect(rows[1][2]).toMatchObject({ total: 4, priority: "P3", name: "Low" });
    expect(rows[2][1]).toMatchObject({ total: 1, priority: "P3", name: "Low" });
    expect(rows[0][1].total).toBe(0);
  });
});

describe("MatrixGrid contract", () => {
  test("is an accessible selection grid and keeps the screenshot hook", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./MatrixGrid.svelte", import.meta.url)),
      "utf8",
    );
    expect(source).toContain('role="grid"');
    expect(source).toContain('role="gridcell"');
    expect(source).toContain("aria-selected");
    expect(source).toContain('data-testid="matrix-grid"');
  });
});

describe("moveMatrixCell", () => {
  test("moves one cell at a time and clamps at the edges", () => {
    expect(moveMatrixCell(2, 2, "ArrowUp")).toEqual({ impact: 1, urgency: 2 });
    expect(moveMatrixCell(2, 2, "ArrowDown")).toEqual({ impact: 3, urgency: 2 });
    expect(moveMatrixCell(2, 2, "ArrowLeft")).toEqual({ impact: 2, urgency: 1 });
    expect(moveMatrixCell(2, 2, "ArrowRight")).toEqual({ impact: 2, urgency: 3 });
    expect(moveMatrixCell(1, 1, "ArrowUp")).toEqual({ impact: 1, urgency: 1 });
    expect(moveMatrixCell(3, 3, "ArrowRight")).toEqual({ impact: 3, urgency: 3 });
    expect(moveMatrixCell(2, 2, "Enter")).toBeNull();
  });
});
