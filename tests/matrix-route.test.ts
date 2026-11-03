/**
 * `/matrix` layout load: the route projects the filtered stream onto the nine
 * classified impact × urgency cells, separates issues awaiting assessment, and
 * resolves the selected cell (explicit `?cell=` or highest-priority populated
 * default). The load is exercised with the same `url`/`parent` shape SvelteKit
 * passes, against the shared in-memory DB.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_PRIORITY_MATRIX, matrixCellMeta } from "#lib/priority";
import { matrixGrid } from "#lib/components/matrix/matrix-grid";
import { setConfig } from "#/lib/server/config";
import { EMPTY_FILTER } from "#lib/server/issues/filters";
import { matrixBoard } from "#lib/server/issues/queries";
import type { MatrixBoard } from "#/lib/server/issues/types";
import { load } from "#/routes/(app)/matrix/+layout.server";
import { clearMirror } from "#tests/mirror-helpers";
import {
  seedPlanningIssue,
  seedPlanningRepo,
  type PlanningIssueSeed,
} from "#tests/planning-helpers";
import { TEST_CONFIG } from "#tests/test-config";

/** Five open issues across the axis pairs plus one closed (excluded by default). */
function matrixSeed(): number {
  const repo = seedPlanningRepo("acme/widgets");
  const add = (
    number: number,
    impact: number | null,
    urgency: number | null,
    extra: Partial<PlanningIssueSeed> = {},
  ) => seedPlanningIssue({ repoId: repo, number, impact, urgency, ...extra });
  add(1, 1, 1);
  add(2, 1, null);
  add(3, null, 2);
  add(4, null, null);
  add(5, 3, 3, { status: "todo" });
  add(6, 2, 2, { state: "closed", stateReason: "completed" });
  return repo;
}

function cell(board: MatrixBoard, impact: number, urgency: number) {
  return board.cells.find(
    (entry) => entry.impact === impact && entry.urgency === urgency,
  )!;
}

async function loadMatrix(search = "") {
  return load({
    url: new URL(`http://x/matrix${search}`),
    parent: async () => ({ viewerExternalId: null }),
  } as never);
}

beforeEach(() => {
  setConfig(TEST_CONFIG);
  clearMirror();
});

describe("matrix route", () => {
  test("the matrix load defaults to open issues and nine classified cells", async () => {
    matrixSeed();
    const data = await loadMatrix();
    expect(data.matrix.cells).toHaveLength(9);
    expect(cell(data.matrix, 1, 1).total).toBe(1);
    expect(cell(data.matrix, 2, 2).total).toBe(0);
    expect(data.matrix.total).toBe(5);
    expect(data.matrix.rated).toBe(2);
    expect(data.matrix.needsAssessment).toBe(3);
  });

  test("selects the highest-priority populated cell by default", async () => {
    matrixSeed();
    const data = await loadMatrix();
    expect(data.selection.impact).toBe(1);
    expect(data.selection.urgency).toBe(1);
    expect(data.selection.issues.total).toBe(1);
    expect(data.selection.issues.items.map((issue) => issue.number)).toEqual([1]);
  });

  test("an explicit cell selects its issues, including an empty cell", async () => {
    matrixSeed();
    const populated = await loadMatrix("?cell=3-3");
    expect(populated.selection).toMatchObject({ impact: 3, urgency: 3 });
    expect(populated.selection.issues.items.map((issue) => issue.number)).toEqual([5]);

    const empty = await loadMatrix("?cell=2-2");
    expect(empty.selection).toMatchObject({ impact: 2, urgency: 2 });
    expect(empty.selection.issues.total).toBe(0);
    expect(empty.selection.issues.items).toEqual([]);
  });

  test("an invalid cell falls back to the default", async () => {
    matrixSeed();
    const data = await loadMatrix("?cell=9-9");
    expect(data.selection).toMatchObject({ impact: 1, urgency: 1 });
  });

  test("the assessment queue is scoped and complete", async () => {
    matrixSeed();
    const data = await loadMatrix();
    expect(data.assessment.total).toBe(3);
    expect(data.assessment.items.map((issue) => issue.number).sort((a, b) => a - b)).toEqual([
      2, 3, 4,
    ]);
  });

  test("search narrows the matrix, queue, and selected cell together", async () => {
    matrixSeed();
    const data = await loadMatrix("?cell=3-3&q=Issue+5");
    expect(data.matrix.total).toBe(1);
    expect(data.matrix.rated).toBe(1);
    expect(data.matrix.needsAssessment).toBe(0);
    expect(data.selection).toMatchObject({ impact: 3, urgency: 3 });
    expect(data.selection.issues.total).toBe(1);
    expect(data.assessment.items).toEqual([]);
  });

  test("an explicit empty selection persists when filters match nothing", async () => {
    matrixSeed();
    const data = await loadMatrix("?cell=2-2&q=does-not-match");
    expect(data.matrix.total).toBe(0);
    expect(data.selection).toMatchObject({ impact: 2, urgency: 2 });
    expect(data.selection.issues.total).toBe(0);
    expect(data.assessment.total).toBe(0);
  });
});

describe("matrix contract exports", () => {
  test("matrixCellMeta derives the P1 label", () => {
    expect(matrixCellMeta(1, 1).label).toBe("P1 · High");
  });

  test("matrixGrid projects an empty board onto the 3×3 grid", () => {
    const grid = matrixGrid({
      cells: [],
      total: 0,
      rated: 0,
      needsAssessment: 0,
    });
    expect(grid).toHaveLength(3);
    expect(grid[0]).toHaveLength(3);
    expect(grid[0][0]).toMatchObject({ total: 0, priority: "P1" });
    expect(grid[2][2]).toMatchObject({ total: 0, priority: "P3" });
  });

  test("the grid priority matches the canonical lookup", () => {
    matrixSeed();
    const board = matrixBoard({ ...EMPTY_FILTER, states: ["open"] });
    const grid = matrixGrid(board);
    for (const row of grid) {
      for (const projected of row) {
        expect(projected.priority).toBe(
          DEFAULT_PRIORITY_MATRIX[
            projected.impact as 1 | 2 | 3
          ][projected.urgency as 1 | 2 | 3],
        );
      }
    }
  });
});
