/**
 * GitHub-native issue relationships (issue #34).
 *
 * Parent/sub-issue and blocked-by/blocking edges live in two separate GraphQL
 * queries, never in the main hydration query. A GitHub Enterprise host that
 * predates either feature rejects only its own query: the failure is logged and
 * the previously stored edge set is left untouched, while issue hydration keeps
 * working. Progress is derived from the mirrored child edges, not from
 * `subIssuesSummary`.
 *
 * Both queries use `nodes(ids:)` batches of 100, GitHub's per-query ceiling, and
 * normalise refs into `owner/name` plus number. Missing titles are tolerated;
 * a ref without a usable number is dropped. At most 100 children or
 * dependencies are kept per issue because that is what one connection page
 * contains.
 */
import { createLogger, errorFields } from "#lib/server/log";
import * as mirror from "./mirror";

const log = createLogger({ component: "sync" });

/** GitHub's `nodes(ids:)` ceiling, matching the main hydration batch size. */
export const RELATION_BATCH_SIZE = 100;

/** One connection page, so a single issue keeps at most 100 edges per kind. */
export const MAX_RELATIONS_PER_KIND = 100;

/**
 * Parent and first 100 sub-issues. `subIssuesSummary` is deliberately not
 * requested: progress is computed from the mirrored child edges so a stale
 * summary can never inflate it.
 */
export const SUB_ISSUES_QUERY = `query FunnelSubIssues($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue {
      number
      parent { number title state url repository { nameWithOwner } }
      subIssues(first: 100) {
        nodes { number title state url repository { nameWithOwner } }
      }
    }
  }
}`;

/**
 * Blocked-by and blocking edges. GitHub hosts without issue dependencies reject
 * this query; callers isolate the failure per query.
 */
export const DEPENDENCIES_QUERY = `query FunnelIssueDependencies($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue {
      number
      blockedBy(first: 100) {
        nodes { number title state url repository { nameWithOwner } }
      }
      blocking(first: 100) {
        nodes { number title state url repository { nameWithOwner } }
      }
    }
  }
}`;

/** Injectable GraphQL function, structurally identical to `hydrate.ts`. */
export type RelationsGraphqlFn = (
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

/** A related issue as the mirror and Inspector need it. */
export interface RelationRef {
  /** `owner/name`; the target's repository, or the source's when absent. */
  repo: string;
  number: number;
  title: string;
  /** Lower-case `open` or `closed`. */
  state: string;
  url: string;
}

export interface NormalizedSubIssues {
  parent: RelationRef | null;
  children: RelationRef[];
}

export interface NormalizedDependencies {
  blockedBy: RelationRef[];
  blocking: RelationRef[];
}

interface GqlRelationNode {
  number?: unknown;
  title?: unknown;
  state?: unknown;
  url?: unknown;
  repository?: { nameWithOwner?: unknown } | null;
}

interface GqlRelationConnection {
  nodes?: GqlRelationNode[] | null;
}

interface GqlRelationIssue {
  number?: unknown;
  parent?: GqlRelationNode | null;
  subIssues?: GqlRelationConnection | null;
  blockedBy?: GqlRelationConnection | null;
  blocking?: GqlRelationConnection | null;
}

/** Split ids into GraphQL batches (kept local so this module has no cycle). */
function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Normalise one related-issue node. A missing number cannot identify the edge
 * and is dropped; every other field degrades to a safe default. GitHub reports
 * state in upper case, while the mirror stores lower case.
 */
export function normalizeRelationRef(
  node: GqlRelationNode | null | undefined,
  sourceRepo: string,
): RelationRef | null {
  if (!node) return null;
  const number = node.number;
  if (
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return null;
  }
  const repo =
    typeof node.repository?.nameWithOwner === "string" &&
    node.repository.nameWithOwner.length > 0
      ? node.repository.nameWithOwner
      : sourceRepo;
  return {
    repo,
    number,
    title: typeof node.title === "string" ? node.title : "",
    state:
      typeof node.state === "string" && node.state.length > 0
        ? node.state.toLowerCase()
        : "open",
    url: typeof node.url === "string" ? node.url : "",
  };
}

/**
 * Normalise a connection nodes list: drop malformed refs, deduplicate by repo
 * and number, sort by repo then number, and cap at one page.
 */
export function normalizeRelationList(
  nodes: readonly GqlRelationNode[] | null | undefined,
  sourceRepo: string,
  limit = MAX_RELATIONS_PER_KIND,
): RelationRef[] {
  const unique = new Map<string, RelationRef>();
  for (const node of nodes ?? []) {
    const ref = normalizeRelationRef(node, sourceRepo);
    if (!ref) continue;
    unique.set(`${ref.repo}\u0000${ref.number}`, ref);
  }
  return [...unique.values()]
    .sort(
      (a, b) => a.repo.localeCompare(b.repo) || a.number - b.number,
    )
    .slice(0, limit);
}

/** Normalise one sub-issues query node. */
export function normalizeSubIssues(
  node: GqlRelationIssue | null | undefined,
  sourceRepo: string,
): NormalizedSubIssues {
  return {
    parent: normalizeRelationRef(node?.parent, sourceRepo),
    children: normalizeRelationList(node?.subIssues?.nodes, sourceRepo),
  };
}

/** Normalise one dependencies query node. */
export function normalizeDependencies(
  node: GqlRelationIssue | null | undefined,
  sourceRepo: string,
): NormalizedDependencies {
  return {
    blockedBy: normalizeRelationList(node?.blockedBy?.nodes, sourceRepo),
    blocking: normalizeRelationList(node?.blocking?.nodes, sourceRepo),
  };
}

/**
 * Fetch parent/child edges for `nodeIds`. The returned map is keyed by the
 * source issue number reported by GitHub; nodes without one are skipped.
 * Throws on a rejected query so the caller can keep prior rows intact.
 */
export async function fetchSubIssueRelations(
  graphqlFn: RelationsGraphqlFn,
  sourceRepo: string,
  nodeIds: readonly string[],
): Promise<Map<number, NormalizedSubIssues>> {
  const result = new Map<number, NormalizedSubIssues>();
  for (const ids of batches(nodeIds, RELATION_BATCH_SIZE)) {
    const response = (await graphqlFn(SUB_ISSUES_QUERY, { ids })) as {
      nodes?: Array<GqlRelationIssue | null>;
    };
    const nodes = response?.nodes ?? [];
    for (const node of nodes) {
      if (typeof node?.number !== "number") continue;
      result.set(node.number, normalizeSubIssues(node, sourceRepo));
    }
  }
  return result;
}

/**
 * Fetch blocked-by/blocking edges for `nodeIds`, keyed by source issue number.
 * Throws on a rejected query so the caller can keep prior rows intact.
 */
export async function fetchDependencyRelations(
  graphqlFn: RelationsGraphqlFn,
  sourceRepo: string,
  nodeIds: readonly string[],
): Promise<Map<number, NormalizedDependencies>> {
  const result = new Map<number, NormalizedDependencies>();
  for (const ids of batches(nodeIds, RELATION_BATCH_SIZE)) {
    const response = (await graphqlFn(DEPENDENCIES_QUERY, { ids })) as {
      nodes?: Array<GqlRelationIssue | null>;
    };
    const nodes = response?.nodes ?? [];
    for (const node of nodes) {
      if (typeof node?.number !== "number") continue;
      result.set(node.number, normalizeDependencies(node, sourceRepo));
    }
  }
  return result;
}

/**
 * Hydrate both relationship sets for a batch of source issues. Each query is
 * isolated: one failing leaves its previously stored rows intact, and neither
 * failure can fail the issue upsert. The GraphQL host may reject the
 * dependency fields on older GHES versions; that is logged and ignored.
 */
export async function syncIssueRelations(
  graphqlFn: RelationsGraphqlFn,
  repo: mirror.RepoRow,
  nodeIds: readonly string[],
): Promise<void> {
  if (nodeIds.length === 0) return;
  const sourceRepo = `${repo.org}/${repo.name}`;

  try {
    const subIssues = await fetchSubIssueRelations(
      graphqlFn,
      sourceRepo,
      nodeIds,
    );
    for (const [issueNumber, relations] of subIssues) {
      mirror.replaceIssueSubIssueRelations(
        repo.id,
        issueNumber,
        relations.parent,
        relations.children,
      );
    }
  } catch (error) {
    log.warn(
      { repo: sourceRepo, ...errorFields(error) },
      "sub-issue relation hydration failed",
    );
  }

  try {
    const dependencies = await fetchDependencyRelations(
      graphqlFn,
      sourceRepo,
      nodeIds,
    );
    for (const [issueNumber, relations] of dependencies) {
      mirror.replaceIssueDependencyRelations(
        repo.id,
        issueNumber,
        relations.blockedBy,
        relations.blocking,
      );
    }
  } catch (error) {
    log.warn(
      { repo: sourceRepo, ...errorFields(error) },
      "issue dependency hydration failed",
    );
  }
}
