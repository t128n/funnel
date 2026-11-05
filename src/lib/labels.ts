/**
 * Canonical reserved-label vocabulary (SPEC §5.1), shared by the server
 * provisioner and the cockpit UI.
 *
 * This module is deliberately dependency-free so it can be imported from both
 * `src/lib/server/**` and client components. `src/lib/server/github/labels.ts`
 * re-exports these so the server keeps a single source of truth.
 *
 * ## Logical keys vs actual GitHub names
 *
 * The *logical key* (`base`) is the stable vocabulary used by the mirror,
 * filters, URL parameters, the HTTP API and every write shortcut: `backlog`,
 * `todo`, `in-progress`, `in-review`, `sm`, `md`, `lg`, ... It never changes
 * when the instance configures a label prefix.
 *
 * The *actual name* is what GitHub sees and what `mirror_thread_label` stores.
 * With `labels.prefix = "funnel"` the actual names are `funnel-backlog`,
 * `funnel-todo`, ... and the logical keys stay `backlog`, `todo`, ...
 *
 * Provisioning, label writes and reserved-label recognition always use the
 * actual names; `deriveMetadata` maps an actual name back to its logical key so
 * no mirror or schema migration is needed. Old unprefixed labels become
 * ordinary labels once a prefix is configured.
 */
export type LabelGroup =
  | "status"
  | "priority"
  | "impact"
  | "urgency"
  | "size"
  | "flags"
  | "epic";

export interface CanonicalLabel {
  /** Actual GitHub label name (`todo`, or `funnel-todo` with a prefix). */
  name: string;
  /** Stable logical key (`todo`); never prefixed. */
  base: string;
  /** Six-digit hex without `#`, the format the GitHub labels API expects. */
  color: string;
  description: string;
  group: LabelGroup;
}

interface LabelDefinition {
  base: string;
  color: string;
  description: string;
  group: LabelGroup;
}

const LABEL_DEFINITIONS: readonly LabelDefinition[] = [
  // Status (SPEC §5.1). Absence of a status label means "untriaged" (Inbox).
  {
    base: "backlog",
    color: "6f737a",
    description: "Status: Backlog",
    group: "status",
  },
  { base: "todo", color: "56a8f5", description: "Status: Todo", group: "status" },
  {
    base: "in-progress",
    color: "3574f0",
    description: "Status: In Progress",
    group: "status",
  },
  {
    base: "in-review",
    color: "b389f5",
    description: "Status: In Review",
    group: "status",
  },
  // Flags (SPEC §5.1). Orthogonal to status: an issue keeps its stage and
  // carries a flag alongside it. Absence means "not flagged".
  {
    base: "blocked",
    color: "fa6675",
    description: "Flag: Blocked",
    group: "flags",
  },
  // Triage inputs. One label per group; absence means "not assessed".
  // Priority is derived from their pair and carries no GitHub label.
  {
    base: "sev",
    color: "fa6675",
    description: "Impact: Severe",
    group: "impact",
  },
  {
    base: "mod",
    color: "cf8e6d",
    description: "Impact: Moderate",
    group: "impact",
  },
  {
    base: "min",
    color: "6aab73",
    description: "Impact: Minor",
    group: "impact",
  },
  {
    base: "high",
    color: "f87171",
    description: "Urgency: High",
    group: "urgency",
  },
  {
    base: "mid",
    color: "facc15",
    description: "Urgency: Mid",
    group: "urgency",
  },
  {
    base: "low",
    color: "94a3b8",
    description: "Urgency: Low",
    group: "urgency",
  },
  // Size. Absence means "unestimated".
  { base: "sm", color: "6aab73", description: "Size: Small", group: "size" },
  { base: "md", color: "2aacb8", description: "Size: Medium", group: "size" },
  { base: "lg", color: "e28d78", description: "Size: Large", group: "size" },
  // Epic. A type marker, orthogonal to status, size and the blocked flag:
  // an epic is just an issue whose children live in its body metadata.
  {
    base: "epic",
    color: "b389f5",
    description: "Type: Epic",
    group: "epic",
  },
];

/** Maximum accepted length of the configured label prefix. */
export const LABEL_PREFIX_MAX_LENGTH = 32;

/**
 * Normalize a candidate prefix: trim surrounding whitespace and drop trailing
 * hyphens so `funnel-` and `funnel` both produce `funnel-todo`. An empty or
 * all-hyphen value means "no prefix".
 */
export function normalizeLabelPrefix(prefix: string): string {
  return prefix.trim().replace(/-+$/, "");
}

/**
 * Whether a normalized prefix is safe to build GitHub labels from. Letters and
 * digits separated by single hyphens only; no whitespace, punctuation, or
 * leading/trailing separator.
 */
export function isValidLabelPrefix(prefix: string): boolean {
  return (
    prefix === "" ||
    (prefix.length <= LABEL_PREFIX_MAX_LENGTH &&
      /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(prefix))
  );
}

/** Build the fifteen reserved labels for a prefix, keeping stable base keys. */
export function buildReservedLabels(prefix = ""): CanonicalLabel[] {
  const normalized = normalizeLabelPrefix(prefix);
  return LABEL_DEFINITIONS.map((definition) => ({
    ...definition,
    name: normalized ? `${normalized}-${definition.base}` : definition.base,
  }));
}

/** Lookup tables for one configured prefix. */
export interface ReservedVocabulary {
  /** Normalized prefix; `""` when labels are unprefixed. */
  prefix: string;
  /** Every reserved label, in canonical order. */
  labels: readonly CanonicalLabel[];
  /** Actual lowercase name -> label. */
  byName: ReadonlyMap<string, CanonicalLabel>;
  /** Logical key -> label. */
  byBase: ReadonlyMap<string, CanonicalLabel>;
}

/** Build the lookup tables for a prefix. Pure and safe on both sides. */
export function buildVocabulary(prefix = ""): ReservedVocabulary {
  const normalized = normalizeLabelPrefix(prefix);
  const labels = buildReservedLabels(normalized);
  return {
    prefix: normalized,
    labels,
    byName: new Map(labels.map((label) => [label.name.toLowerCase(), label])),
    byBase: new Map(labels.map((label) => [label.base.toLowerCase(), label])),
  };
}

/** The unprefixed vocabulary; also the default for existing callers/tests. */
export const DEFAULT_VOCABULARY: ReservedVocabulary = buildVocabulary("");

/**
 * Default vocabulary entries. Preserved as the canonical export for existing
 * importers; `name` and `base` are identical at the default prefix.
 */
export const CANONICAL_LABELS: readonly CanonicalLabel[] =
  DEFAULT_VOCABULARY.labels;

// ---------------------------------------------------------------------------
// Active vocabulary (client-side)
// ---------------------------------------------------------------------------

/**
 * The vocabulary the cockpit is currently displaying. Initialized from the
 * `(app)` layout so raw GitHub label names in feed/inspector payloads are
 * recognized without threading the prefix through every component. Server
 * code must pass an explicit vocabulary to the pure helpers below rather than
 * relying on this mutable value (SSR renders can interleave).
 */
let activeVocabulary: ReservedVocabulary = DEFAULT_VOCABULARY;

/** Point the cockpit at a configured prefix (called by the `(app)` layout). */
export function setActiveLabelPrefix(prefix: string): void {
  activeVocabulary = buildVocabulary(prefix);
}

/** The vocabulary the cockpit is currently displaying. */
export function getActiveVocabulary(): ReservedVocabulary {
  return activeVocabulary;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** Look up a reserved label by actual GitHub name (case-insensitive). */
export function canonicalLabel(
  name: string,
  vocabulary: ReservedVocabulary = activeVocabulary,
): CanonicalLabel | undefined {
  return vocabulary.byName.get(name.toLowerCase());
}

/** Look up a reserved label by its stable logical key. */
export function canonicalLabelByBase(
  base: string,
  vocabulary: ReservedVocabulary = activeVocabulary,
): CanonicalLabel | undefined {
  return vocabulary.byBase.get(base.toLowerCase());
}

/** The actual GitHub name for a logical key, or `undefined` when unknown. */
export function canonicalName(
  base: string,
  vocabulary: ReservedVocabulary = activeVocabulary,
): string | undefined {
  return canonicalLabelByBase(base, vocabulary)?.name;
}

/** The logical key for an actual GitHub name, or `undefined` when unknown. */
export function logicalLabel(
  name: string,
  vocabulary: ReservedVocabulary = activeVocabulary,
): string | undefined {
  return canonicalLabel(name, vocabulary)?.base;
}

/** Group for an actual GitHub label name, or `undefined` when not reserved. */
export function groupOfLabel(
  name: string,
  vocabulary: ReservedVocabulary = activeVocabulary,
): LabelGroup | undefined {
  return canonicalLabel(name, vocabulary)?.group;
}

/** Whether an actual GitHub label name belongs to the reserved vocabulary. */
export function isReservedLabel(
  name: string,
  vocabulary: ReservedVocabulary = activeVocabulary,
): boolean {
  return canonicalLabel(name, vocabulary) !== undefined;
}

/**
 * Inline `color: …` declaration tinting a canonical label's icon to its own
 * hue, or `undefined` when the name is empty or unrecognised. Accepts a logical
 * key (the UI's status/size tokens) or an actual GitHub name. Shared by the
 * Inspector and intake property pills so both read the same.
 */
export function labelTint(
  name: string | null | undefined,
  vocabulary: ReservedVocabulary = activeVocabulary,
): string | undefined {
  const color = name
    ? (canonicalLabel(name, vocabulary) ?? canonicalLabelByBase(name, vocabulary))
        ?.color
    : undefined;
  if (!color) return undefined;
  return `color: ${/^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color}`;
}

/**
 * Inbox membership (SPEC §2.1): an open issue that carries no status label.
 * The server query mirrors this as `state = "open" AND status IS NULL`; the
 * client reuses it to project the queue optimistically, so setting a status
 * moves an issue out the moment the overlay is applied rather than waiting for
 * the mirror to catch up. Keep the two definitions in step.
 */
export function isUntriaged(issue: { state: string; status: string | null }): boolean {
  return issue.state === "open" && issue.status === null;
}

export interface LabelOption {
  /** Logical key sent to the API/URL; never prefixed. */
  value: string;
  /** Human display name. */
  label: string;
  color: string;
}

/** Build the options for one group from a vocabulary. */
export function labelOptions(
  group: LabelGroup,
  display: Record<string, string>,
  vocabulary: ReservedVocabulary = DEFAULT_VOCABULARY,
): LabelOption[] {
  return vocabulary.labels
    .filter((label) => label.group === group)
    .map((label) => ({
      value: label.base,
      label: display[label.base] ?? label.base,
      color: label.color,
    }));
}

const STATUS_DISPLAY: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In Progress",
  "in-review": "In Review",
};

const SIZE_DISPLAY: Record<string, string> = { sm: "S", md: "M", lg: "L" };

/**
 * The four open workflow stages, in order; `done` is appended by the board.
 * Values stay logical and labels stay human: options are presentation, while
 * the configured prefix only affects actual GitHub names.
 */
export const STATUS_OPTIONS = labelOptions("status", STATUS_DISPLAY);
export const SIZE_OPTIONS = labelOptions("size", SIZE_DISPLAY);

/** Board columns including Done (SPEC §9.3); blocking is not a column. */
export const BOARD_COLUMNS: readonly { key: string; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "Todo" },
  { key: "in-progress", label: "In Progress" },
  { key: "in-review", label: "In Review" },
  { key: "done", label: "Done" },
];
