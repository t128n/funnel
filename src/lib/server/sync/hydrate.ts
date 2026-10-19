/**
 * Batched GraphQL hydration (SPEC §7.2).
 *
 * REST change detection yields issue `node_id`s; this module fetches their
 * bodies, labels, assignees, and first page of comments in GraphQL `nodes()`
 * batches of {@link BATCH_SIZE} (100, GitHub's per-query ceiling). Pull requests
 * are skipped implicitly: only an `... on Issue` inline fragment is requested,
 * so a PR node comes back without the issue fields and is dropped.
 *
 * The installation GraphQL client is host-aware (`github.graphql`), so the same
 * code targets github.com or a GHES instance. `hydrateNodes` is pure over an
 * injected `graphql` function for testability.
 */
import { and, eq } from "drizzle-orm";
import { getConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { authAccount } from "#lib/server/db/schema";
import { github } from "#lib/server/github/app.server";
import { createLogger } from "#lib/server/log";
import {
  parseMentions,
  planIssueNotifications,
} from "#lib/server/notifications/plan";
import {
  createNotifications,
  getRecipientByGithubId,
  getRecipientByLogin,
  listWatchers,
} from "#lib/server/notifications/service";
import type {
  IssueSnapshot,
  NotificationDraft,
  PlanIssueInput,
  Recipient,
} from "#lib/server/notifications/types";
import { deriveMetadata } from "./conflicts";
import * as mirror from "./mirror";

const log = createLogger({ component: "sync" });

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

// ---------------------------------------------------------------------------
// Notification hook
// ---------------------------------------------------------------------------

/** Read the current mirror state of an issue in planner shape. */
export function snapshotIssue(
  repoId: number,
  number: number,
): IssueSnapshot | null {
  const issue = mirror.getIssue(repoId, number);
  if (!issue) return null;
  return {
    status: issue.status ?? "",
    priority: issue.priority ?? "",
    state: issue.state,
    updatedAt: issue.updatedAt,
    assigneeIds: mirror.getIssueAssigneeIds(repoId, number),
    comments: mirror.getIssueComments(repoId, number),
    title: issue.title,
    number: issue.number,
  };
}

/** One hydrated issue diff, handed to the rule planner. */
export interface IssueChangeInput {
  repoId: number;
  org: string;
  name: string;
  number: number;
  previous: IssueSnapshot | null;
  next: IssueSnapshot;
  /** The signed-in Funnel user whose write triggered this refresh, if any. */
  actorUserId?: string;
}

/**
 * Swappable seam for tests. Production callers pass nothing and get the real
 * store, watcher query and pure planner.
 */
export interface NotifyIssueDeps {
  listWatchers?: (org: string, name: string, issueNumber: number) => Recipient[];
  planIssueNotifications?: (input: PlanIssueInput) => NotificationDraft[];
  createNotifications?: (drafts: readonly NotificationDraft[]) => number;
  recipients?: Recipient[];
  actor?: Recipient | null;
  now?: number;
}

/** Resolve the signed-in Funnel user to their GitHub identity. */
function recipientByUserId(userId: string): Recipient | null {
  const account = db
    .select({ accountId: authAccount.accountId })
    .from(authAccount)
    .where(
      and(
        eq(authAccount.userId, userId),
        eq(authAccount.providerId, "github"),
      ),
    )
    .get();
  const githubId = Number(account?.accountId);
  return Number.isInteger(githubId)
    ? getRecipientByGithubId(githubId)
    : null;
}

/**
 * The Funnel users who could receive one of this diff's notifications: current
 * assignees, repo collaborators, and the authors/mentioned people in new
 * comments. The planner decides which of them actually qualify.
 */
function collectRecipients(input: IssueChangeInput): Recipient[] {
  const found = new Map<string, Recipient>();
  const add = (recipient: Recipient | null): void => {
    if (recipient) found.set(recipient.userId, recipient);
  };

  for (const githubId of input.next.assigneeIds) {
    add(getRecipientByGithubId(githubId));
  }
  for (const user of mirror.getRepoAssignees(input.repoId)) {
    add(getRecipientByGithubId(user.githubId));
  }

  const knownComments = new Set(
    (input.previous?.comments ?? []).map((comment) => comment.githubId),
  );
  for (const comment of input.next.comments) {
    if (knownComments.has(comment.githubId)) continue;
    if (comment.authorLogin) add(getRecipientByLogin(comment.authorLogin));
    for (const login of parseMentions(comment.body)) {
      add(getRecipientByLogin(login));
    }
  }

  return [...found.values()];
}

/**
 * Turn a stored issue diff into notifications. A first sighting is silent, and
 * the actor's own drafts are dropped even if the planner could not resolve them.
 */
export function notifyIssueChanges(
  input: IssueChangeInput,
  deps: NotifyIssueDeps = {},
): number {
  if (!input.previous) return 0;

  const plan = deps.planIssueNotifications ?? planIssueNotifications;
  const store = deps.createNotifications ?? createNotifications;
  const watchers = deps.listWatchers
    ? deps.listWatchers(input.org, input.name, input.number)
    : listWatchers(input.org, input.name, input.number);
  const actor =
    deps.actor !== undefined
      ? deps.actor
      : input.actorUserId
        ? recipientByUserId(input.actorUserId)
        : null;
  const recipients = deps.recipients ?? collectRecipients(input);

  const drafts = plan({
    previous: input.previous,
    next: input.next,
    repo: `${input.org}/${input.name}`,
    watchers,
    recipients,
    actor,
    now: deps.now ?? Date.now(),
  });
  const filtered = input.actorUserId
    ? drafts.filter((draft) => draft.userId !== input.actorUserId)
    : drafts;
  return store(filtered);
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

export interface HydrateOptions {
  /** The signed-in Funnel user whose write triggered this refresh. */
  actorUserId?: string;
  /** Test seam: replace the whole change hook. */
  notify?: (input: IssueChangeInput) => number;
  /** Test seam: override the instance's enabled switch. */
  notificationsEnabled?: () => boolean | Promise<boolean>;
}

/** Whether the instance-wide notification master switch is on (default true). */
async function notificationsEnabled(): Promise<boolean> {
  try {
    return (await getConfig()).notifications.enabled;
  } catch {
    // Config failures must not block mirror hydration.
    return true;
  }
}

/**
 * Hydrate and persist node ids, computing the cached reserved-label metadata.
 * Conflict resolution is the caller's job (it needs the REST client and may
 * issue writes); `hydrateAndStore` only stores the deterministic projection.
 *
 * Before each upsert the issue's previous mirror state is snapshotted; after
 * the upsert the hook plans and stores notifications. A first sighting has no
 * previous state, so it stays silent (the historical-flood guard).
 */
export async function hydrateAndStore(
  installationId: number,
  repoId: number,
  nodeIds: readonly string[],
  graphqlFn?: GraphqlFn,
  options: HydrateOptions = {},
): Promise<mirror.IssueRecord[]> {
  const gql = graphqlFn ?? (await github.graphql(installationId));
  const records = await hydrateNodes(gql, repoId, nodeIds);
  const repo = mirror.getRepo(repoId);
  const enabled = options.notificationsEnabled
    ? await options.notificationsEnabled()
    : await notificationsEnabled();
  const notify = options.notify ?? notifyIssueChanges;

  for (const record of records) {
    const previous =
      enabled && repo ? snapshotIssue(repoId, record.number) : null;
    const derived = deriveMetadata(record.labels);
    mirror.upsertIssue(record, {
      status: derived.status,
      priority: derived.priority,
      size: derived.size,
      blocked: derived.blocked,
      labelConflict: derived.conflicts.length > 0,
    });

    if (!enabled || !repo || !previous) continue;
    const next = snapshotIssue(repoId, record.number);
    if (!next) continue;
    try {
      notify({
        repoId,
        org: repo.org,
        name: repo.name,
        number: record.number,
        previous,
        next,
        actorUserId: options.actorUserId,
      });
    } catch (error) {
      // A notification failure is logged, never allowed to fail the mirror.
      log.warn(
        { repo: `${repo.org}/${repo.name}`, number: record.number, err: error },
        "notification hook failed",
      );
    }
  }
  return records;
}
