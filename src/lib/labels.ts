/**
 * Canonical reserved-label vocabulary (SPEC §5.1), shared by the server
 * provisioner and the cockpit UI.
 *
 * This module is deliberately dependency-free so it can be imported from both
 * `src/lib/server/**` and client components. `src/lib/server/github/labels.ts`
 * re-exports these so the server keeps a single source of truth.
 */
export type LabelGroup = "status" | "priority" | "size";

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
    color: "525252",
    description: "Status: Backlog",
    group: "status",
  },
  { name: "todo", color: "78a9ff", description: "Status: Todo", group: "status" },
  {
    name: "in-progress",
    color: "33b1ff",
    description: "Status: In Progress",
    group: "status",
  },
  {
    name: "in-review",
    color: "be95ff",
    description: "Status: In Review",
    group: "status",
  },
  {
    name: "blocked",
    color: "ee5396",
    description: "Status: Blocked",
    group: "status",
  },
  // Priority. Absence means "no priority".
  {
    name: "p1",
    color: "ee5396",
    description: "Priority: 1 (critical)",
    group: "priority",
  },
  {
    name: "p2",
    color: "FF6F00",
    description: "Priority: 2 (high)",
    group: "priority",
  },
  {
    name: "p3",
    color: "42be65",
    description: "Priority: 3 (normal)",
    group: "priority",
  },
  // Size. Absence means "unestimated".
  { name: "sm", color: "42be65", description: "Size: Small", group: "size" },
  { name: "md", color: "3ddbd9", description: "Size: Medium", group: "size" },
  { name: "lg", color: "ff7eb6", description: "Size: Large", group: "size" },
];

const BY_NAME = new Map(CANONICAL_LABELS.map((l) => [l.name.toLowerCase(), l]));

/** Look up a reserved label by name (case-insensitive). */
export function canonicalLabel(name: string): CanonicalLabel | undefined {
  return BY_NAME.get(name.toLowerCase());
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
  blocked: "Blocked",
};

const PRIORITY_DISPLAY: Record<string, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

const SIZE_DISPLAY: Record<string, string> = { sm: "S", md: "M", lg: "L" };

/** The five open board columns, in order; `done` is appended by the board. */
export const STATUS_OPTIONS = options("status", STATUS_DISPLAY);
export const PRIORITY_OPTIONS = options("priority", PRIORITY_DISPLAY);
export const SIZE_OPTIONS = options("size", SIZE_DISPLAY);

/** Board columns including Done (SPEC §9.3). */
export const BOARD_COLUMNS: readonly { key: string; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "Todo" },
  { key: "in-progress", label: "In Progress" },
  { key: "in-review", label: "In Review" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];
