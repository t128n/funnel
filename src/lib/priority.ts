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

/**
 * One decision criterion for a scale level. `label` is the short axis the
 * triager weighs (e.g. `Reach`); `anchor` is the concrete description that
 * anchors that level of the criterion (e.g. how many users are affected).
 */
export interface ScaleCriterion {
  label: string;
  anchor: string;
}

export interface ScaleLevel<T extends number> {
  value: T;
  name: string;
  definition: string;
  criteria: readonly ScaleCriterion[];
}

export const IMPACT_SCALE: readonly ScaleLevel<Impact>[] = [
  {
    value: 1,
    name: "Severe",
    definition: "Blocks many users or a critical path; no workaround.",
    criteria: [
      { label: "Reach", anchor: "All or most users, or a whole tenant or region." },
      { label: "Data", anchor: "Irreversible loss, corruption, or exposure." },
      { label: "Money", anchor: "Material revenue, billing, or contractual loss." },
      { label: "Locations", anchor: "Several sites, regions, or tenants." },
      { label: "Workaround", anchor: "None; the critical path is blocked." },
    ],
  },
  {
    value: 2,
    name: "Moderate",
    definition: "Blocks a team or an important flow; workaround is costly.",
    criteria: [
      { label: "Reach", anchor: "A team, a key customer segment, or one location." },
      { label: "Data", anchor: "Recoverable loss or a contained exposure." },
      { label: "Money", anchor: "Bounded, forecastable cost." },
      { label: "Locations", anchor: "One site or region." },
      { label: "Workaround", anchor: "Exists, but is costly or slow." },
    ],
  },
  {
    value: 3,
    name: "Minor",
    definition: "Degrades a flow or is a single-person annoyance.",
    criteria: [
      { label: "Reach", anchor: "An individual or a small group." },
      { label: "Data", anchor: "No data loss; presentation or convenience only." },
      { label: "Money", anchor: "Negligible or no cost." },
      { label: "Locations", anchor: "A single device or an edge case." },
      { label: "Workaround", anchor: "Trivial and sustainable." },
    ],
  },
];

export const URGENCY_SCALE: readonly ScaleLevel<Urgency>[] = [
  {
    value: 1,
    name: "High",
    definition: "Nothing else can proceed; harm accrues immediately.",
    criteria: [
      { label: "Harm", anchor: "Damage accrues now, hour by hour." },
      { label: "Exposure", anchor: "Data or money is at risk while it waits." },
      { label: "Spread", anchor: "More people or locations are affected over time." },
      { label: "Dependencies", anchor: "Other people or teams are blocked." },
      { label: "Deadline", anchor: "A regulatory, contractual, or launch deadline is imminent." },
    ],
  },
  {
    value: 2,
    name: "Mid",
    definition: "Active degradation; needs this cycle.",
    criteria: [
      { label: "Harm", anchor: "Active degradation with a stable ceiling." },
      { label: "Exposure", anchor: "Contained data or money exposure." },
      { label: "Spread", anchor: "One location or group; not spreading." },
      { label: "Dependencies", anchor: "A few people are waiting." },
      { label: "Deadline", anchor: "Needs this cycle, not this hour." },
    ],
  },
  {
    value: 3,
    name: "Low",
    definition: "Can wait a sprint or longer.",
    criteria: [
      { label: "Harm", anchor: "No ongoing harm." },
      { label: "Exposure", anchor: "No data or money at risk." },
      { label: "Spread", anchor: "Stable; affects one location." },
      { label: "Dependencies", anchor: "Nobody is blocked." },
      { label: "Deadline", anchor: "No deadline inside this cycle." },
    ],
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

/**
 * The legacy 4×4 axis order (three assessed levels followed by the unassessed
 * null) used by {@link matrixCellMeta} to describe partial pairs. The `/matrix`
 * view itself renders only the nine assessed combinations; incomplete issues
 * live in its assessment queue.
 */
export const MATRIX_IMPACT_VALUES: readonly (Impact | null)[] = [1, 2, 3, null];
export const MATRIX_URGENCY_VALUES: readonly (Urgency | null)[] = [1, 2, 3, null];

/** Used when either axis is unset or invalid; missing input is not severity. */
export const DEFAULT_PRIORITY: Priority = "P3";

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
  return typeof numeric === "number" && URGENCY_SET.has(numeric)
    ? (numeric as Urgency)
    : null;
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

export function isPriorityMatrix(value: unknown): value is PriorityMatrix {
  if (typeof value !== "object" || value === null) return false;
  const matrix = value as Record<number, unknown>;
  return IMPACT_VALUES.every((impact) => {
    const row = matrix[impact];
    if (typeof row !== "object" || row === null) return false;
    const cells = row as Record<number, unknown>;
    return URGENCY_VALUES.every(
      (urgency) =>
        typeof cells[urgency] === "string" && PRIORITY_SET.has(cells[urgency]),
    );
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

/** How completely a matrix cell's two axes are assessed. */
export type MatrixAssessment = "both" | "partial" | "none";

/** Visual tone for a matrix cell, keyed by priority tier or assessment state. */
export type MatrixCellTone = "p1" | "p2" | "p3" | "partial" | "none";

/** Display metadata for one classified pair (legacy 4×4 labels). */
export interface MatrixCellMeta {
  priority: Priority | null;
  assessment: MatrixAssessment;
  label: string;
  tone: MatrixCellTone;
}

/**
 * Classify a matrix cell from its two axes. Both assessed → the derived
 * priority; exactly one → "Needs assessment"; neither → "No priority". Partial
 * and unassessed cells never collapse to a `P3` label even though the stored
 * priority cache still derives the P3 fallback.
 */
export function matrixCellMeta(
  impact: unknown,
  urgency: unknown,
): MatrixCellMeta {
  const i = parseImpact(impact);
  const u = parseUrgency(urgency);
  if (i !== null && u !== null) {
    const priority = DEFAULT_PRIORITY_MATRIX[i][u];
    return {
      priority,
      assessment: "both",
      label: `${priority} · ${priorityMeta(priority)!.name}`,
      tone: priority.toLowerCase() as MatrixCellTone,
    };
  }
  if (i !== null || u !== null) {
    return {
      priority: null,
      assessment: "partial",
      label: "Needs assessment",
      tone: "partial",
    };
  }
  return {
    priority: null,
    assessment: "none",
    label: "No priority",
    tone: "none",
  };
}

/**
 * Look up a scale level by value, coercing numeric strings. Out-of-range,
 * non-numeric and null values resolve to `null` (absent).
 */
export function scaleLevel<T extends number>(
  scale: readonly ScaleLevel<T>[],
  value: unknown,
): ScaleLevel<T> | null {
  const numeric =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return null;
  return scale.find((level) => level.value === numeric) ?? null;
}
