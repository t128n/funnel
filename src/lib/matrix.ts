/**
 * Pure helpers for the 3×3 impact × urgency matrix.
 *
 * The matrix is a navigation control, not a second priority model: every
 * lookup goes through `#lib/priority`, and the cell position is the only state
 * the view owns. Kept free of Svelte and server imports so the route load, the
 * grid projection, and their tests share the same rules.
 */
import {
  IMPACT_VALUES,
  URGENCY_VALUES,
  derivePriority,
  isImpact,
  isUrgency,
  priorityMeta,
  type Impact,
  type Priority,
  type Urgency,
} from "#lib/priority";

/** One classified cell of the matrix. */
export interface MatrixPosition {
  impact: Impact;
  urgency: Urgency;
}

/** The derived priority for one classified cell. */
export interface MatrixPriority {
  priority: Priority;
  name: string;
  label: string;
}

/** The nine classified positions, in impact-major, then urgency order. */
export const MATRIX_POSITIONS: readonly MatrixPosition[] = IMPACT_VALUES.flatMap(
  (impact) => URGENCY_VALUES.map((urgency) => ({ impact, urgency })),
);

const CELL_PATTERN = /^([1-3])-([1-3])$/;
const PRIORITY_ORDER: readonly Priority[] = ["P1", "P2", "P3"];

/**
 * Parse a URL cell selector (`?cell=2-3`). The selector names the assessed
 * numeric levels, so a partial or unassessed pair can never be selected.
 */
export function parseMatrixCell(
  value: string | null | undefined,
): MatrixPosition | null {
  if (!value) return null;
  const match = CELL_PATTERN.exec(value.trim());
  if (!match) return null;
  const impact = Number(match[1]);
  const urgency = Number(match[2]);
  return isImpact(impact) && isUrgency(urgency)
    ? { impact, urgency }
    : null;
}

/** Serialize a cell position for the `cell` query parameter. */
export function matrixCellValue(impact: number, urgency: number): string {
  return `${impact}-${urgency}`;
}

/** Derive the priority displayed inside a classified cell. */
export function matrixCellPriority(
  impact: Impact,
  urgency: Urgency,
): MatrixPriority {
  const priority = derivePriority(impact, urgency);
  const meta = priorityMeta(priority)!;
  return { priority, name: meta.name, label: `${priority} · ${meta.name}` };
}

/** The minimum shape `defaultMatrixCell` reads from a counted board. */
export interface MatrixCellCount {
  impact: number | null;
  urgency: number | null;
  total: number;
}

/**
 * Pick the initial cell: the highest-priority populated cell, with ties
 * resolved by impact descending (Severe first) then urgency descending (High
 * first). An empty board falls back to Severe impact / High urgency so the
 * layout and its empty state stay deterministic.
 */
export function defaultMatrixCell(
  cells: readonly MatrixCellCount[],
): MatrixPosition {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    if (!isImpact(cell.impact) || !isUrgency(cell.urgency)) continue;
    counts.set(matrixCellValue(cell.impact, cell.urgency), cell.total);
  }

  for (const priority of PRIORITY_ORDER) {
    for (const position of MATRIX_POSITIONS) {
      if (
        matrixCellPriority(position.impact, position.urgency).priority ===
          priority &&
        (counts.get(matrixCellValue(position.impact, position.urgency)) ?? 0) > 0
      ) {
        return position;
      }
    }
  }

  return { impact: 1, urgency: 1 };
}
