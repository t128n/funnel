/**
 * Impact × urgency input scales and the priority lookup matrix.
 *
 * Impact and urgency are the two orthogonal triage inputs, carried as ordinary
 * reserved GitHub labels (`sev`/`mod`/`min` and `high`/`mid`/`low`). Priority is
 * derived from their pair and is never a GitHub label. The matrix is plain data
 * so an instance can supply its own {@link PriorityRules} without a schema
 * change.
 */

export const IMPACT_VALUES = [1, 2, 3] as const;
export const URGENCY_VALUES = [1, 2, 3] as const;
export const PRIORITY_VALUES = ["P1", "P2", "P3"] as const;

/** The lowercase query-string form of each derived priority. */
export const PRIORITY_FILTER_VALUES = ["p1", "p2", "p3"] as const;

export type Impact = (typeof IMPACT_VALUES)[number];
export type Urgency = (typeof URGENCY_VALUES)[number];
export type Priority = (typeof PRIORITY_VALUES)[number];

/** Canonical impact label names, in severity order. */
export const IMPACT_LABEL_VALUES = ["sev", "mod", "min"] as const;
/** Canonical urgency label names, in urgency order. */
export const URGENCY_LABEL_VALUES = ["high", "mid", "low"] as const;

/** Canonical impact label name → numeric level. */
export const IMPACT_LABELS: Readonly<Record<string, Impact>> = {
  sev: 1,
  mod: 2,
  min: 3,
};

/** Canonical urgency label name → numeric level. */
export const URGENCY_LABELS: Readonly<Record<string, Urgency>> = {
  high: 1,
  mid: 2,
  low: 3,
};

const IMPACT_BY_VALUE: Readonly<Record<Impact, string>> = {
  1: "sev",
  2: "mod",
  3: "min",
};
const URGENCY_BY_VALUE: Readonly<Record<Urgency, string>> = {
  1: "high",
  2: "mid",
  3: "low",
};

/** The canonical GitHub label for an impact level (`1` → `sev`). */
export function impactLabel(value: unknown): string | null {
  const level = parseImpact(value);
  return level === null ? null : IMPACT_BY_VALUE[level];
}

/** The canonical GitHub label for an urgency level (`1` → `high`). */
export function urgencyLabel(value: unknown): string | null {
  const level = parseUrgency(value);
  return level === null ? null : URGENCY_BY_VALUE[level];
}

/**
 * Display metadata for a derived priority. P1 is the highest tier; the signal
 * metaphor follows `docs/DESIGN.md`.
 */
export interface PriorityLevel {
  value: Priority;
  name: string;
  definition: string;
  color: string;
}

export const PRIORITY_SCALE: readonly PriorityLevel[] = [
  {
    value: "P1",
    name: "High",
    definition: "Stop and fix now; a top-of-queue issue.",
    color: "fb923c",
  },
  {
    value: "P2",
    name: "Medium",
    definition: "Important; schedule it soon.",
    color: "facc15",
  },
  {
    value: "P3",
    name: "Low",
    definition: "Can wait; keep it on the backlog.",
    color: "94a3b8",
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

/** A priority's display name (`P1` → `High`), or `null` when unset. */
export function priorityName(value: unknown): string | null {
  return priorityMeta(value)?.name ?? null;
}

/**
 * The retired reserved labels. They are only compared against the derived
 * priority so an old p-label that disagrees can be flagged; Funnel never writes
 * or provisions them.
 */
export const RETIRED_PRIORITY_LABELS: Readonly<Record<string, Priority>> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export interface ScaleLevel<T extends number> {
  value: T;
  name: string;
  definition: string;
}

export const IMPACT_SCALE: readonly ScaleLevel<Impact>[] = [
  {
    value: 1,
    name: "Severe",
    definition: "Blocks many users or a critical path; no workaround.",
  },
  {
    value: 2,
    name: "Moderate",
    definition: "Blocks a team or an important flow; workaround is costly.",
  },
  {
    value: 3,
    name: "Minor",
    definition: "Degrades a flow or is a single-person annoyance.",
  },
];

export const URGENCY_SCALE: readonly ScaleLevel<Urgency>[] = [
  {
    value: 1,
    name: "High",
    definition: "Nothing else can proceed; harm accrues immediately.",
  },
  {
    value: 2,
    name: "Mid",
    definition: "Active degradation; needs this cycle.",
  },
  {
    value: 3,
    name: "Low",
    definition: "Can wait a sprint or longer.",
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
 * The 3×3 grid collapses to three tiers along the diagonal.
 */
export const DEFAULT_PRIORITY_MATRIX: PriorityMatrix = {
  1: { 1: "P1", 2: "P1", 3: "P2" },
  2: { 1: "P1", 2: "P2", 3: "P3" },
  3: { 1: "P2", 2: "P3", 3: "P3" },
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

/** Coerce a stored value (`1` or `"1"`) to an impact, or `null`. */
export function parseImpact(value: unknown): Impact | null {
  const numeric =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  return isImpact(numeric) ? numeric : null;
}

/** Coerce a stored value (`1` or `"1"`) to an urgency, or `null`. */
export function parseUrgency(value: unknown): Urgency | null {
  const numeric =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  return isUrgency(numeric) ? numeric : null;
}

/** Coerce a canonical label name to its impact level, or `null`. */
export function parseImpactLabel(value: unknown): Impact | null {
  return typeof value === "string"
    ? (IMPACT_LABELS[value.trim().toLowerCase()] ?? null)
    : null;
}

/** Coerce a canonical label name to its urgency level, or `null`. */
export function parseUrgencyLabel(value: unknown): Urgency | null {
  return typeof value === "string"
    ? (URGENCY_LABELS[value.trim().toLowerCase()] ?? null)
    : null;
}

/** Coerce a stored/metadata priority (`P1`, `p1`, …) to the canonical form. */
export function parsePriority(value: unknown): Priority | null {
  if (isPriority(value)) return value;
  return typeof value === "string"
    ? (RETIRED_PRIORITY_LABELS[value.trim().toLowerCase()] ?? null)
    : null;
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
 * an instance.
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
 * still uses the matrix fallback.
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

/** Numeric rank for sorting: P1 → 0 … P3 → 2. */
export function priorityRank(priority: Priority): number {
  return PRIORITY_VALUES.indexOf(priority);
}

/** The lowercase filter/label form (`P2` → `p2`). */
export function priorityLabelName(priority: Priority): string {
  return priority.toLowerCase();
}

/** Map a retired `p1`–`p3` label name to its tier, or `null`. */
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
 * present, the canonical P1 → P3 order wins.
 */
export function legacyPriorityFromLabels(
  labels: readonly string[],
): Priority | null {
  for (const value of PRIORITY_VALUES) {
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

/**
 * Whether a retired p-label disagrees with the derived priority. Such a label
 * is never trusted; the mirror's `labelConflict` flag surfaces it. Matching
 * labels are simply stale and stay quiet; more than one is ambiguous.
 */
export function retiredPriorityConflict(
  derived: Priority | null,
  labels: readonly string[],
): boolean {
  const present = labels.filter((label) => isRetiredPriorityLabel(label));
  if (present.length === 0) return false;
  if (present.length > 1) return true;
  const legacy = legacyPriorityFromLabels(labels);
  return legacy !== derived;
}
