/**
 * 3×3 matrix projection: turns the nine counted cells from the query layer
 * into a row-major grid keyed by the fixed axis order, attaching the derived
 * priority so the grid renders without re-deriving it.
 */
import { matrixCellPriority, matrixCellValue } from "#lib/matrix";
import { IMPACT_VALUES, URGENCY_VALUES, type Priority } from "#lib/priority";
import type { MatrixBoard } from "#lib/server/issues/types";

/** One projected cell, ready to render. */
export interface MatrixGridCell {
  impact: number;
  urgency: number;
  total: number;
  priority: Priority;
  name: string;
}

/** One step of the grid's roving keyboard focus, or `null` for other keys. */
export function moveMatrixCell(
  impact: number,
  urgency: number,
  key: string,
): { impact: number; urgency: number } | null {
  switch (key) {
    case "ArrowUp":
      return { impact: Math.max(1, impact - 1), urgency };
    case "ArrowDown":
      return { impact: Math.min(3, impact + 1), urgency };
    case "ArrowLeft":
      return { impact, urgency: Math.max(1, urgency - 1) };
    case "ArrowRight":
      return { impact, urgency: Math.min(3, urgency + 1) };
    default:
      return null;
  }
}

/**
 * Below `lg` the matrix and the selected-cell detail stack with the grid
 * first, so a tap changes a cell that is already above the fold while the
 * result sits below it. At those widths selection must reveal the detail;
 * on `lg+` the two columns are side by side and the page should not jump.
 */
export function revealsStackedSelection(viewportWidth: number): boolean {
  return viewportWidth < 992;
}

/**
 * Project the board onto the fixed 3×3 grid (impact rows × urgency columns).
 * A pair missing from `board.cells` reads as zero, so an empty board still
 * lays out fully.
 */
export function matrixGrid(board: MatrixBoard): MatrixGridCell[][] {
  const totals = new Map<string, number>();
  for (const cell of board.cells) {
    totals.set(matrixCellValue(cell.impact, cell.urgency), cell.total);
  }

  return IMPACT_VALUES.map((impact) =>
    URGENCY_VALUES.map((urgency) => {
      const priority = matrixCellPriority(impact, urgency);
      return {
        impact,
        urgency,
        total: totals.get(matrixCellValue(impact, urgency)) ?? 0,
        priority: priority.priority,
        name: priority.name,
      };
    }),
  );
}
