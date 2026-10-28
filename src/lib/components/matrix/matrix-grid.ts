/**
 * 4×4 matrix projection: turns the flat 16-cell {@link MatrixBoard} from the
 * query layer into a row-major grid keyed by the fixed axis order, attaching
 * the display metadata (`matrixCellMeta`) to every cell so the table renders
 * without re-deriving it.
 */
import {
  MATRIX_IMPACT_VALUES,
  MATRIX_URGENCY_VALUES,
  matrixCellMeta,
  type MatrixCellMeta,
} from "#lib/priority";
import type {
  IssueListItem,
  MatrixBoard,
  MatrixCell,
} from "#lib/server/issues/types";

/** One projected cell, ready to render. */
export interface MatrixGridCell {
  impact: number | null;
  urgency: number | null;
  total: number;
  issues: IssueListItem[];
  meta: MatrixCellMeta;
}

/** Stable key for a cell, unambiguous across `null` axes. */
function cellKey(impact: number | null, urgency: number | null): string {
  return `${impact}\u0000${urgency}`;
}

/**
 * Project the board onto the fixed 4×4 grid (impact rows × urgency columns).
 * Every one of the 16 cells is always present: a pair missing from
 * `board.cells` reads as `{ total: 0, issues: [] }`, so an empty board still
 * lays out fully.
 */
export function matrixGrid(board: MatrixBoard): MatrixGridCell[][] {
  const byCell = new Map<string, MatrixCell>();
  for (const cell of board.cells) {
    byCell.set(cellKey(cell.impact, cell.urgency), cell);
  }
  return MATRIX_IMPACT_VALUES.map((impact) =>
    MATRIX_URGENCY_VALUES.map((urgency) => {
      const cell = byCell.get(cellKey(impact, urgency));
      return {
        impact,
        urgency,
        total: cell?.total ?? 0,
        issues: cell?.issues ?? [],
        meta: matrixCellMeta(impact, urgency),
      };
    }),
  );
}
