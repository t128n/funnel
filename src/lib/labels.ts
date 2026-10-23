/**
 * Canonical reserved-label vocabulary (SPEC §5.1), shared by the server
 * provisioner and the cockpit UI.
 *
 * This module is deliberately dependency-free so it can be imported from both
 * `src/lib/server/**` and client components. `src/lib/server/github/labels.ts`
 * re-exports these so the server keeps a single source of truth.
 */
export type LabelGroup =
  | "status"
  | "priority"
  | "impact"
  | "urgency"
  | "size"
  | "flags";

export interface CanonicalLabel {
  name: string;
  /** Six-digit hex without `#`, the format the GitHub labels API expects. */
  color: string;
  description: string;
  group: LabelGroup;
}

export const CANONICAL_LABELS: readonly CanonicalLabel[] = [
  // Status (SPEC §5.1). Absence of a status label means "untriaged" (Inbox).
  {
    name: "backlog",
    color: "6f737a",
    description: "Status: Backlog",
    group: "status",
  },
  { name: "todo", color: "56a8f5", description: "Status: Todo", group: "status" },
  {
    name: "in-progress",
    color: "3574f0",
    description: "Status: In Progress",
    group: "status",
  },
  {
    name: "in-review",
    color: "b389f5",
    description: "Status: In Review",
    group: "status",
  },
  // Flags (SPEC §5.1). Orthogonal to status: an issue keeps its stage and
  // carries a flag alongside it. Absence means "not flagged".
  {
    name: "blocked",
    color: "fa6675",
    description: "Flag: Blocked",
    group: "flags",
  },
  // Triage inputs. One label per group; absence means "not assessed".
  // Priority is derived from their pair and carries no GitHub label.
  {
    name: "sev",
    color: "fa6675",
    description: "Impact: Severe",
    group: "impact",
  },
  {
    name: "mod",
    color: "cf8e6d",
    description: "Impact: Moderate",
    group: "impact",
  },
  {
    name: "min",
    color: "6aab73",
    description: "Impact: Minor",
    group: "impact",
  },
  {
    name: "high",
    color: "f87171",
    description: "Urgency: High",
    group: "urgency",
  },
  {
    name: "mid",
    color: "facc15",
    description: "Urgency: Mid",
    group: "urgency",
  },
  {
    name: "low",
    color: "94a3b8",
    description: "Urgency: Low",
    group: "urgency",
  },
  // Size. Absence means "unestimated".
  { name: "sm", color: "6aab73", description: "Size: Small", group: "size" },
  { name: "md", color: "2aacb8", description: "Size: Medium", group: "size" },
  { name: "lg", color: "e28d78", description: "Size: Large", group: "size" },
];

const BY_NAME = new Map(CANONICAL_LABELS.map((l) => [l.name.toLowerCase(), l]));

/** Look up a reserved label by name (case-insensitive). */
export function canonicalLabel(name: string): CanonicalLabel | undefined {
  return BY_NAME.get(name.toLowerCase());
}

/**
 * Inline `color: …` declaration tinting a canonical label's icon to its own
 * hue, or `undefined` when the name is empty or unrecognised. Shared by the
 * Inspector and intake property pills so both read the same.
 */
export function labelTint(name: string | null | undefined): string | undefined {
  const color = name ? canonicalLabel(name)?.color : undefined;
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
  value: string;
  label: string;
  color: string;
}

function options(group: LabelGroup, display: Record<string, string>): LabelOption[] {
  return CANONICAL_LABELS.filter((l) => l.group === group).map((l) => ({
    value: l.name,
    label: display[l.name] ?? l.name,
    color: l.color,
  }));
}

const STATUS_DISPLAY: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In Progress",
  "in-review": "In Review",
};

const SIZE_DISPLAY: Record<string, string> = { sm: "S", md: "M", lg: "L" };

/** The four open workflow stages, in order; `done` is appended by the board. */
export const STATUS_OPTIONS = options("status", STATUS_DISPLAY);
export const SIZE_OPTIONS = options("size", SIZE_DISPLAY);

/** Board columns including Done (SPEC §9.3); blocking is not a column. */
export const BOARD_COLUMNS: readonly { key: string; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "Todo" },
  { key: "in-progress", label: "In Progress" },
  { key: "in-review", label: "In Review" },
  { key: "done", label: "Done" },
];
