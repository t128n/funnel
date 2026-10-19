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

/** The lowercase query-string form of each priority. */
export const PRIORITY_FILTER_VALUES = ["p0", "p1", "p2", "p3"] as const;

/**
 * Display metadata for a derived priority. P0 is the designed "Urgent" token;
 * the remaining tiers reuse the signal-bar metaphor from `docs/DESIGN.md`.
 * Colours are six-digit hex without `#`, the format the label API uses.
 */
export interface PriorityLevel {
  value: Priority;
  name: string;
  definition: string;
  color: string;
  urgent: boolean;
}

export const PRIORITY_SCALE: readonly PriorityLevel[] = [
  {
    value: "P0",
    name: "Urgent",
    definition: "Blocks many users or a critical path right now.",
    color: "f87171",
    urgent: true,
  },
  {
    value: "P1",
    name: "High",
    definition: "Important and needed this cycle.",
    color: "fb923c",
    urgent: false,
  },
  {
    value: "P2",
    name: "Medium",
    definition: "Should be handled soon; a workaround exists.",
    color: "facc15",
    urgent: false,
  },
  {
    value: "P3",
    name: "Low",
    definition: "Can wait; not currently urgent.",
    color: "94a3b8",
    urgent: false,
  },
];

const PRIORITY_BY_VALUE = new Map<string, PriorityLevel>(
  PRIORITY_SCALE.map((level) => [level.value, level]),
);

/** Look up display metadata for a derived priority (case-insensitive). */
export function priorityMeta(value: unknown): PriorityLevel | null {
  return typeof value === "string"
    ? (PRIORITY_BY_VALUE.get(value.toUpperCase()) ?? null)
    : null;
}

/** A priority's display name (`P0` → `Urgent`), or `null` when unset. */
export function priorityName(value: unknown): string | null {
  return priorityMeta(value)?.name ?? null;
}

/**
 * The retired reserved labels. They are read once, to seed a missing state row
 * from the old projection, and never written back to GitHub.
 */
export const RETIRED_PRIORITY_LABELS: Readonly<Record<string, Priority>> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

/** Map a retired `p1`–`p3` label name to its priority, or `null`. */
export function retiredPriority(name: unknown): Priority | null {
  return typeof name === "string"
    ? (RETIRED_PRIORITY_LABELS[name.trim().toLowerCase()] ?? null)
    : null;
}

/** Whether a label name is a retired priority label. */
export function isRetiredPriorityLabel(name: unknown): boolean {
  return retiredPriority(name) !== null;
}

/**
 * The priority an issue's retired labels imply, if any. When more than one is
 * present, the canonical P1 → P3 order wins; the mismatch is flagged by sync.
 */
export function legacyPriorityFromLabels(
  labels: readonly string[],
): Priority | null {
  for (const value of PRIORITY_VALUES.slice(1)) {
    const name = value.toLowerCase();
    if (labels.some((label) => label.toLowerCase() === name)) return value;
  }
  return null;
}

/** Every retired priority label carried by an issue, lowercased. */
export function legacyPriorityLabels(labels: readonly string[]): string[] {
  return labels
    .map((label) => label.toLowerCase())
    .filter((label) => isRetiredPriorityLabel(label));
}

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

/**
 * Derivation with an explicit "not assessed" state: both axes absent yields
 * `null` (the empty priority state), while a single missing or malformed axis
 * still uses the matrix fallback. This is what the Inspector, the local write
 * endpoint, and the optimistic overlay use.
 */
export function derivePriorityOrNull(
  impact: unknown,
  urgency: unknown,
  rules: Partial<PriorityRules> | PriorityMatrix = DEFAULT_PRIORITY_RULES,
): Priority | null {
  if (impact === null || impact === undefined) {
    if (urgency === null || urgency === undefined) return null;
  }
  return derivePriority(impact, urgency, rules);
}

/** Numeric rank for sorting: P0 → 0 … P3 → 3. */
export function priorityRank(priority: Priority): number {
  return PRIORITY_VALUES.indexOf(priority);
}

/** The lowercase label form a future derived-priority label would use. */
export function priorityLabelName(priority: Priority): string {
  return priority.toLowerCase();
}
