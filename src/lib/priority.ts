/**
 * Impact × urgency input scales and the priority lookup matrix.
 *
 * Impact and urgency are the two orthogonal triage inputs. Priority is derived
 * from their pair; it is never entered directly. The matrix is plain data so an
 * instance can supply its own {@link PriorityRules} without a schema change.
 */

export const IMPACT_VALUES = [1, 2, 3, 4] as const;
export const URGENCY_VALUES = [1, 2, 3, 4] as const;
export const PRIORITY_VALUES = ["P0", "P1", "P2", "P3"] as const;

export type Impact = (typeof IMPACT_VALUES)[number];
export type Urgency = (typeof URGENCY_VALUES)[number];
export type Priority = (typeof PRIORITY_VALUES)[number];

export interface ScaleLevel<T extends number> {
  value: T;
  name: string;
  definition: string;
}

export const IMPACT_SCALE: readonly ScaleLevel<Impact>[] = [
  {
    value: 1,
    name: "Extensive",
    definition: "Blocks many users or a critical path; no workaround.",
  },
  {
    value: 2,
    name: "Significant",
    definition: "Blocks a team or an important flow; workaround is costly.",
  },
  {
    value: 3,
    name: "Moderate",
    definition: "Degrades a flow; a workaround exists.",
  },
  {
    value: 4,
    name: "Minor",
    definition: "Cosmetic or single-person annoyance.",
  },
];

export const URGENCY_SCALE: readonly ScaleLevel<Urgency>[] = [
  {
    value: 1,
    name: "Critical",
    definition: "Nothing else can proceed; harm accrues immediately.",
  },
  {
    value: 2,
    name: "High",
    definition: "Active degradation; needs this cycle.",
  },
  {
    value: 3,
    name: "Medium",
    definition: "Can wait a sprint.",
  },
  {
    value: 4,
    name: "Low",
    definition: "Can wait indefinitely.",
  },
];

export type PriorityMatrix = {
  readonly [I in Impact]: {
    readonly [U in Urgency]: Priority;
  };
};

/**
 * The single source of truth for impact × urgency → priority. Read a row as
 * impact and a column as urgency: `DEFAULT_PRIORITY_MATRIX[impact][urgency]`.
 * Higher impact/urgency are lower numbers, so priority improves up and left.
 */
export const DEFAULT_PRIORITY_MATRIX: PriorityMatrix = {
  1: { 1: "P0", 2: "P0", 3: "P1", 4: "P2" },
  2: { 1: "P0", 2: "P1", 3: "P2", 4: "P3" },
  3: { 1: "P1", 2: "P2", 3: "P3", 4: "P3" },
  4: { 1: "P2", 2: "P3", 3: "P3", 4: "P3" },
};

/** Used when either axis is unset or invalid; missing input is not severity. */
export const DEFAULT_PRIORITY: Priority = "P3";

export const PRIORITY_MATRIX = DEFAULT_PRIORITY_MATRIX;

export interface PriorityRules {
  readonly matrix: PriorityMatrix;
  readonly fallback: Priority;
}

export const DEFAULT_PRIORITY_RULES: PriorityRules = {
  matrix: DEFAULT_PRIORITY_MATRIX,
  fallback: DEFAULT_PRIORITY,
};

const IMPACT_SET = new Set<number>(IMPACT_VALUES);
const URGENCY_SET = new Set<number>(URGENCY_VALUES);
const PRIORITY_SET = new Set<string>(PRIORITY_VALUES);

export function isImpact(value: unknown): value is Impact {
  return typeof value === "number" && IMPACT_SET.has(value);
}

export function isUrgency(value: unknown): value is Urgency {
  return typeof value === "number" && URGENCY_SET.has(value);
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && PRIORITY_SET.has(value);
}

/** Coerce a stored/metadata value (`1` or `"1"`) to an impact, or `null`. */
export function parseImpact(value: unknown): Impact | null {
  const numeric =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  return isImpact(numeric) ? numeric : null;
}

/** Coerce a stored/metadata value (`1` or `"1"`) to an urgency, or `null`. */
export function parseUrgency(value: unknown): Urgency | null {
  const numeric =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  return isUrgency(numeric) ? numeric : null;
}

export function isPriorityMatrix(value: unknown): value is PriorityMatrix {
  if (typeof value !== "object" || value === null) return false;
  const matrix = value as Record<number, unknown>;
  return IMPACT_VALUES.every((impact) => {
    const row = matrix[impact];
    if (typeof row !== "object" || row === null) return false;
    const cells = row as Record<number, unknown>;
    return URGENCY_VALUES.every((urgency) => isPriority(cells[urgency]));
  });
}

/** Fill in only the rules an instance overrides; the rest stay canonical. */
export function resolvePriorityRules(
  overrides: Partial<PriorityRules> = {},
): PriorityRules {
  return {
    matrix: overrides.matrix ?? DEFAULT_PRIORITY_MATRIX,
    fallback: overrides.fallback ?? DEFAULT_PRIORITY,
  };
}

/**
 * Derive priority from the two axes. An unset or out-of-range axis yields the
 * rules' fallback (P3 by default). Pass `{ matrix }` to override the lookup for
 * an instance; the stored body metadata does not change shape.
 */
export function derivePriority(
  impact: unknown,
  urgency: unknown,
  rules: Partial<PriorityRules> | PriorityMatrix = DEFAULT_PRIORITY_RULES,
): Priority {
  const resolved = isPriorityMatrix(rules)
    ? { matrix: rules, fallback: DEFAULT_PRIORITY }
    : resolvePriorityRules(rules);
  const i = parseImpact(impact);
  const u = parseUrgency(urgency);
  if (i === null || u === null) return resolved.fallback;
  return resolved.matrix[i][u];
}

/** Numeric rank for sorting: P0 → 0 … P3 → 3. */
export function priorityRank(priority: Priority): number {
  return PRIORITY_VALUES.indexOf(priority);
}

/** The lowercase label form a future derived-priority label would use. */
export function priorityLabelName(priority: Priority): string {
  return priority.toLowerCase();
}
