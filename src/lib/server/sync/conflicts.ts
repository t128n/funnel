/**
 * Reserved-label conflict resolution (SPEC §5.2).
 *
 * An issue may carry at most one label per group (status, priority, size). When
 * it accumulates several, `funnel[bot]` inspects the issue timeline and the
 * **latest added label wins**; the superseded labels are removed on GitHub with
 * the App installation token. An ambiguous timeline (no `labeled` events, or a
 * tie on the newest timestamp) leaves the labels untouched and flags the item
 * (`mirror_github_issue.label_conflict`) for the UI instead of guessing.
 *
 * `deriveMetadata` is the pure single-label projection shared by hydration and
 * the UI; `resolveIssueConflict` performs the network round-trips.
 */
import { CANONICAL_LABELS, type LabelGroup } from "#lib/server/github/labels";
import type { InstallationOctokit } from "#lib/server/github/app.server";

/** Reserved-label projection cached on the issue row. */
export interface DerivedMetadata {
  status: string | null;
  priority: string | null;
  size: string | null;
  /** Groups carrying more than one label. */
  conflicts: LabelGroup[];
}

export const GROUP_ORDER: readonly LabelGroup[] = ["status", "priority", "size"];

/** Canonical label name (lowercase) -> group, for fast lookups. */
const GROUP_BY_NAME = new Map<string, LabelGroup>(
  CANONICAL_LABELS.map((l) => [l.name.toLowerCase(), l.group]),
);

const CANONICAL_ORDER = new Map<string, number>(
  CANONICAL_LABELS.map((l, i) => [l.name.toLowerCase(), i]),
);

/** Canonical labels present, grouped. Unknown/non-reserved labels are ignored. */
function groupLabels(
  labelNames: readonly string[],
): Map<LabelGroup, string[]> {
  const grouped = new Map<LabelGroup, string[]>();
  for (const raw of labelNames) {
    const name = raw.toLowerCase();
    const group = GROUP_BY_NAME.get(name);
    if (!group) continue;
    const list = grouped.get(group) ?? [];
    list.push(name);
    grouped.set(group, list);
  }
  return grouped;
}

/** Deterministic winner when only the label set is known: canonical order. */
function firstCanonical(names: readonly string[]): string {
  return [...names].sort(
    (a, b) => (CANONICAL_ORDER.get(a) ?? 0) - (CANONICAL_ORDER.get(b) ?? 0),
  )[0];
}

/**
 * Project a label set onto the reserved vocabulary without any network access.
 * When a group has multiple labels the deterministic winner is reported but the
 * group is also listed in `conflicts` so callers can trigger resolution.
 */
export function deriveMetadata(labelNames: readonly string[]): DerivedMetadata {
  const grouped = groupLabels(labelNames);
  const metadata: DerivedMetadata = {
    status: null,
    priority: null,
    size: null,
    conflicts: [],
  };
  for (const group of GROUP_ORDER) {
    const names = grouped.get(group);
    if (!names || names.length === 0) continue;
    const winner = names.length === 1 ? names[0] : firstCanonical(names);
    if (group === "status") metadata.status = winner;
    else if (group === "priority") metadata.priority = winner;
    else metadata.size = winner;
    if (names.length > 1) metadata.conflicts.push(group);
  }
  return metadata;
}

/** A `labeled` timeline event reduced to the fields we compare. */
export interface LabeledEvent {
  label: string;
  createdAt: number;
}

/** Extract `labeled` events (name + timestamp) from a timeline response. */
export function parseTimeline(events: readonly unknown[]): LabeledEvent[] {
  const out: LabeledEvent[] = [];
  for (const raw of events) {
    if (typeof raw !== "object" || raw === null) continue;
    const event = raw as {
      event?: unknown;
      created_at?: unknown;
      label?: unknown;
    };
    if (event.event !== "labeled") continue;
    const label = event.label as { name?: unknown } | null | undefined;
    if (typeof event.created_at !== "string") continue;
    if (!label || typeof label.name !== "string") continue;
    const createdAt = Date.parse(event.created_at);
    if (Number.isNaN(createdAt)) continue;
    out.push({ label: label.name, createdAt });
  }
  return out;
}

export interface ConflictResolution {
  /** Winning canonical label per conflicted group. */
  winners: Map<LabelGroup, string>;
  /** Labels that should be removed (canonical casing as present). */
  obsolete: string[];
  /** True when the timeline cannot decide the winner. */
  ambiguous: boolean;
}

/**
 * Decide the winner per conflicted group from timeline events. A group with a
 * single label is never conflicted. Missing events or a timestamp tie on the
 * newest event makes the group ambiguous; `obsolete` is still computed from the
 * deterministic winner so a caller could act, but callers should not.
 */
export function resolveWinners(
  labelNames: readonly string[],
  events: readonly LabeledEvent[],
): ConflictResolution {
  const grouped = groupLabels(labelNames);
  const winners = new Map<LabelGroup, string>();
  const obsolete: string[] = [];
  let ambiguous = false;

  for (const group of GROUP_ORDER) {
    const names = grouped.get(group);
    if (!names || names.length <= 1) continue;
    const candidates = events.filter((e) =>
      names.includes(e.label.toLowerCase()),
    );
    if (candidates.length === 0) {
      ambiguous = true;
      winners.set(group, firstCanonical(names));
      obsolete.push(...names.filter((n) => n !== firstCanonical(names)));
      continue;
    }
    const newest = Math.max(...candidates.map((c) => c.createdAt));
    const latest = candidates.filter((c) => c.createdAt === newest);
    if (latest.length !== 1) ambiguous = true;
    const winner = latest[latest.length - 1].label.toLowerCase();
    winners.set(group, winner);
    for (const name of names) if (name !== winner) obsolete.push(name);
  }

  return { winners, obsolete, ambiguous };
}

const TIMELINE_PER_PAGE = 100;

/** Paginate `GET .../issues/{n}/timeline`, returning only `labeled` events. */
export async function fetchTimeline(
  octokit: Pick<InstallationOctokit, "request">,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<LabeledEvent[]> {
  const events: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline",
      {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: TIMELINE_PER_PAGE,
        page,
      },
    );
    const items = data as unknown[];
    events.push(...items);
    if (items.length < TIMELINE_PER_PAGE) break;
  }
  return parseTimeline(events);
}

export interface ResolvedConflict {
  metadata: DerivedMetadata;
  /** Labels actually removed on GitHub (empty when ambiguous). */
  removed: string[];
  ambiguous: boolean;
}

/**
 * Resolve a single issue's reserved-label conflicts. Ambiguous timelines are
 * left untouched and flagged. Otherwise the obsolete labels are deleted via the
 * installation token and the metadata recomputed from the surviving set.
 */
export async function resolveIssueConflict(
  octokit: Pick<InstallationOctokit, "request">,
  owner: string,
  repo: string,
  issueNumber: number,
  labelNames: readonly string[],
): Promise<ResolvedConflict> {
  const derived = deriveMetadata(labelNames);
  if (derived.conflicts.length === 0) {
    return { metadata: derived, removed: [], ambiguous: false };
  }

  const events = await fetchTimeline(octokit, owner, repo, issueNumber);
  const resolution = resolveWinners(labelNames, events);

  if (resolution.ambiguous) {
    return { metadata: derived, removed: [], ambiguous: true };
  }

  for (const name of resolution.obsolete) {
    await octokit.request(
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}",
      { owner, repo, issue_number: issueNumber, name },
    );
  }

  const removed = new Set(resolution.obsolete.map((n) => n.toLowerCase()));
  const remaining = labelNames.filter((n) => !removed.has(n.toLowerCase()));
  return {
    metadata: deriveMetadata(remaining),
    removed: resolution.obsolete,
    ambiguous: false,
  };
}
