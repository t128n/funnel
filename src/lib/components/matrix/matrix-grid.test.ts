import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { moveMatrixCell, revealsStackedSelection } from "./matrix-grid";
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

  test("fits all three urgency columns below lg", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./MatrixGrid.svelte", import.meta.url)),
      "utf8",
    );
    expect(source).toMatch(
      /@media \(max-width: 991\.98px\)\s*\{[\s\S]*?\.matrix-table\s*\{[^}]*min-width:\s*0/,
    );
  });

  test("reveals the stacked detail after the selection has rendered", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../../routes/(app)/matrix/+page.svelte", import.meta.url),
      ),
      "utf8",
    );
    expect(source).toContain("revealsStackedSelection");
    expect(source).toContain("getElementById('matrix-detail-heading')");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("heading.focus({ preventScroll: true })");
    // Stale-selection tap and keyboard Enter both queue a reveal.
    expect(source).toContain("revealRequest += 1");
    expect(source).not.toMatch(
      /if \(page\.url\.searchParams\.get\('cell'\) === value\) return;/,
    );
    // The reveal runs after a tick and one animation frame, not inside the
    // navigation callback where the grid can still reclaim focus.
    expect(source).toContain("await tick()");
    expect(source).toContain("requestAnimationFrame(revealSelection)");
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

describe("revealsStackedSelection", () => {
  test("reveals the detail only while the layout is stacked below lg", () => {
    expect(revealsStackedSelection(390)).toBe(true);
    expect(revealsStackedSelection(768)).toBe(true);
    expect(revealsStackedSelection(991)).toBe(true);
    expect(revealsStackedSelection(992)).toBe(false);
    expect(revealsStackedSelection(1440)).toBe(false);
  });
});
