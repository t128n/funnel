/**
 * Batched GraphQL hydration (SPEC §7.2).
 *
 * REST change detection yields issue `node_id`s; this module fetches their
 * bodies, labels, assignees, and first page of comments in GraphQL `nodes()`
 * batches of {@link BATCH_SIZE} (100, GitHub's per-query ceiling). Pull requests
 * are skipped implicitly: only an `... on Issue` inline fragment is requested,
 * so a PR node comes back without the issue fields and is dropped.
 *
 * The installation provider's GraphQL client is host-aware (`provider.graphql`),
 * so the same code targets github.com or a GHES instance. `hydrateNodes` is
 * pure over an injected `graphql` function for testability.
 */
import { forge } from "#lib/server/forge/providers.server";
import { deriveMetadata } from "./conflicts";
import * as mirror from "./mirror";

export const BATCH_SIZE = 100;

/** GitHub's GraphQL `nodes(ids:)` caps a single query at 100 ids. */
export const HYDRATE_QUERY = `query FunnelHydrate($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue {
      databaseId
      number
      title
      body
      state
      stateReason
      createdAt
      updatedAt
      closedAt
      repository { databaseId }
      author { login avatarUrl ... on User { databaseId } }
      milestone { number }
      labels(first: 100) { nodes { name } }
      assignees(first: 100) { nodes { login avatarUrl ... on User { databaseId } } }
      comments(first: 100) {
        nodes {
          databaseId
          author { login avatarUrl ... on User { databaseId } }
          body
          createdAt
          updatedAt
        }
      }
    }
  }
}`;

export type GraphqlFn = (
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

interface GqlActor {
  databaseId?: number | null;
  login?: string | null;
  avatarUrl?: string | null;
}

interface GqlComment {
  databaseId?: number | null;
  author?: GqlActor | null;
  body?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface GqlNode {
  databaseId?: number | null;
  number?: number | null;
  title?: string | null;
  body?: string | null;
  state?: string | null;
  stateReason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  closedAt?: string | null;
  author?: GqlActor | null;
  milestone?: { number?: number | null } | null;
  labels?: { nodes?: Array<{ name?: string | null }> } | null;
  assignees?: { nodes?: GqlActor[] } | null;
  comments?: { nodes?: GqlComment[] } | null;
}

function ms(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toUser(actor: GqlActor | null | undefined): mirror.UserRecord | null {
  if (
    !actor ||
    typeof actor.databaseId !== "number" ||
    typeof actor.login !== "string"
  ) {
    return null;
  }
  return {
    githubId: actor.databaseId,
    login: actor.login,
    avatarUrl: actor.avatarUrl ?? "",
  };
}

/**
 * Convert one GraphQL node to a mirror record. Returns `null` for PRs (the
 * `... on Issue` fragment leaves them empty) and anything missing identity.
 */
export function normalizeNode(
  node: GqlNode | null | undefined,
  repoId: number,
): mirror.IssueRecord | null {
  if (
    !node ||
    typeof node.databaseId !== "number" ||
    typeof node.number !== "number"
  ) {
    return null;
  }
  const createdAt = ms(node.createdAt);
  const updatedAt = ms(node.updatedAt);
  if (createdAt === null || updatedAt === null) return null;

  const labels = (node.labels?.nodes ?? [])
    .map((l) => l.name)
    .filter((name): name is string => typeof name === "string");

  const assignees = (node.assignees?.nodes ?? [])
    .map(toUser)
    .filter((u): u is mirror.UserRecord => u !== null);

  const comments = (node.comments?.nodes ?? [])
    .filter(
      (c): c is GqlComment & { databaseId: number } =>
        typeof c.databaseId === "number",
    )
    .map((c) => ({
      githubId: c.databaseId,
      author: toUser(c.author),
      body: c.body ?? "",
      createdAt: ms(c.createdAt) ?? 0,
      updatedAt: ms(c.updatedAt) ?? 0,
    }));

  return {
    githubId: node.databaseId,
    repoId,
    number: node.number,
    title: node.title ?? "",
    body: node.body ?? "",
    state: (node.state ?? "open").toLowerCase(),
    stateReason: node.stateReason?.toLowerCase() ?? null,
    author: toUser(node.author),
    milestoneNumber:
      typeof node.milestone?.number === "number" ? node.milestone.number : null,
    createdAt,
    updatedAt,
    closedAt: ms(node.closedAt),
    labels,
    assignees,
    comments,
  };
}

/** Split items into fixed-size chunks (final chunk may be short). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Hydrate node ids into records without touching the database. */
export async function hydrateNodes(
  graphqlFn: GraphqlFn,
  repoId: number,
  nodeIds: readonly string[],
): Promise<mirror.IssueRecord[]> {
  const records: mirror.IssueRecord[] = [];
  for (const ids of chunk(nodeIds, BATCH_SIZE)) {
    const result = (await graphqlFn(HYDRATE_QUERY, { ids })) as {
      nodes?: Array<GqlNode | null>;
    };
    for (const node of result?.nodes ?? []) {
      const record = normalizeNode(node, repoId);
      if (record) records.push(record);
    }
  }
  return records;
}

/**
 * Hydrate and persist node ids, computing the cached reserved-label metadata.
 * Conflict resolution is the caller's job (it needs the REST client and may
 * issue writes); `hydrateAndStore` only stores the deterministic projection.
 */
export async function hydrateAndStore(
  installationId: number,
  repoId: number,
  nodeIds: readonly string[],
  graphqlFn?: GraphqlFn,
): Promise<mirror.IssueRecord[]> {
  const provider = graphqlFn ? undefined : await forge.installationProvider(installationId);
  const gql: GraphqlFn = graphqlFn ?? ((query, variables) => provider!.graphql(query, variables));
  const records = await hydrateNodes(gql, repoId, nodeIds);
  for (const record of records) {
    const derived = deriveMetadata(record.labels);
    mirror.upsertIssue(record, {
      status: derived.status,
      priority: derived.priority,
      size: derived.size,
      blocked: derived.blocked,
      labelConflict: derived.conflicts.length > 0,
    });
  }
  return records;
}
