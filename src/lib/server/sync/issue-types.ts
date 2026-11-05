/**
 * GitHub issue types (Bug, Feature, Task, …) as a disposable mirror column.
 *
 * Issue types are fetched in their own GraphQL query rather than in the main
 * hydration query. A host or repository that does not support them rejects
 * only this query: the failure is logged and the previously stored type is
 * left untouched, while issue hydration keeps working. This mirrors the
 * fail-soft pattern used for sub-issues and dependencies.
 *
 * The query uses `nodes(ids:)` batches of 100, GitHub's per-query ceiling.
 */
import { createLogger, errorFields } from "#lib/server/log";
import * as mirror from "./mirror";

const log = createLogger({ component: "sync" });

/** GitHub's `nodes(ids:)` ceiling, matching the main hydration batch size. */
export const ISSUE_TYPE_BATCH_SIZE = 100;

/**
 * Issue type per issue node. `issueType` is a GitHub GraphQL object with both
 * a node id and a name; only the name is mirrored.
 */
export const ISSUE_TYPES_QUERY = `query FunnelIssueTypes($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue {
      number
      issueType { id name }
    }
  }
}`;

/** Injectable GraphQL function, structurally identical to `hydrate.ts`. */
export type IssueTypesGraphqlFn = (
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

interface GqlIssueType {
  id?: unknown;
  name?: unknown;
}

interface GqlIssueTypeNode {
  number?: unknown;
  issueType?: GqlIssueType | null;
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
 * Normalise one issue-type node.
 *
 * - `issueType: null` or an absent field means "no type" and yields `null`.
 * - A present type with a non-empty trimmed `name` yields that name.
 * - A malformed type (missing/blank name, or a non-object value) is skipped so
 *   a bad payload never clears a previously mirrored type.
 */
export function normalizeIssueType(
  node: GqlIssueTypeNode | null | undefined,
): { number: number; issueType: string | null } | null {
  if (!node) return null;
  const number = node.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    return null;
  }
  const raw = node.issueType;
  if (raw === undefined || raw === null) {
    return { number, issueType: null };
  }
  if (typeof raw !== "object") return null;
  const name = raw.name;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return { number, issueType: trimmed };
}

/**
 * Fetch issue types for `nodeIds`, keyed by the source issue number GitHub
 * reports. Nodes with a malformed type are omitted from the map so their
 * stored value is preserved. Throws on a rejected query so the caller can leave
 * every prior value intact.
 */
export async function fetchIssueTypes(
  graphqlFn: IssueTypesGraphqlFn,
  nodeIds: readonly string[],
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  for (const ids of batches(nodeIds, ISSUE_TYPE_BATCH_SIZE)) {
    const response = (await graphqlFn(ISSUE_TYPES_QUERY, { ids })) as {
      nodes?: Array<GqlIssueTypeNode | null>;
    };
    for (const node of response?.nodes ?? []) {
      const normalized = normalizeIssueType(node);
      if (normalized) {
        result.set(normalized.number, normalized.issueType);
      }
    }
  }
  return result;
}

/**
 * Hydrate issue types for a batch of source issues after their upsert. The
 * query is isolated: a host that rejects `issueType` logs a warning and leaves
 * every previously stored type untouched, and the failure never propagates
 * into the issue sync.
 */
export async function syncIssueTypes(
  graphqlFn: IssueTypesGraphqlFn,
  repo: mirror.RepoRow,
  nodeIds: readonly string[],
): Promise<void> {
  if (nodeIds.length === 0) return;
  try {
    const types = await fetchIssueTypes(graphqlFn, nodeIds);
    mirror.setIssueTypes(repo.id, types);
  } catch (error) {
    log.warn(
      { repo: `${repo.org}/${repo.name}`, ...errorFields(error) },
      "issue type hydration failed",
    );
  }
}
