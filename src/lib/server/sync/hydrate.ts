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
import { and, eq } from "drizzle-orm";
import {
  buildVocabulary,
  DEFAULT_VOCABULARY,
  type ReservedVocabulary,
} from "#lib/labels";
import { db } from "#lib/server/db/index";
import { authAccount, type MirrorIssueEventDetail } from "#lib/server/db/schema";
import { forge } from "#lib/server/forge/providers.server";
import { createLogger, errorFields } from "#lib/server/log";
import { normalizeGraphqlReactions } from "#lib/reactions";
import { readSettings } from "#lib/server/settings/store";
import {
  parseMentions,
  planIssueNotifications,
} from "#lib/server/notifications/plan";
import {
  createNotifications,
  getRecipientByExternalId,
  getRecipientsByExternalIds,
  getRecipientsByLogins,
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
import { syncIssueRelations } from "./relations";
import {
  recordIssueTransitions,
  type IssueTransitionSnapshot,
} from "#lib/server/actuals/transitions";

const log = createLogger({ component: "sync" });

export const BATCH_SIZE = 100;

/** GitHub's GraphQL `nodes(ids:)` caps a single query at 100 ids. */
export const HYDRATE_QUERY = `query FunnelHydrate($ids: [ID!]!, $since: DateTime) {
  nodes(ids: $ids) {
    ... on Issue {
      databaseId
      number
      url
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
      timelineItems(last: 50, since: $since) {
        nodes {
          __typename
          ... on LabeledEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            label { name }
          }
          ... on UnlabeledEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            label { name }
          }
          ... on AssignedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            assignee { login avatarUrl ... on User { databaseId } }
          }
          ... on UnassignedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            assignee { login avatarUrl ... on User { databaseId } }
          }
          ... on ClosedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
          }
          ... on ReopenedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
          }
          ... on CrossReferencedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            source {
              __typename
              ... on PullRequest { number title url }
              ... on Issue { number title url }
            }
          }
          ... on ReferencedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            isCrossRepository
            commit { oid }
          }
          ... on MentionedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
          }
          ... on RenamedTitleEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            previousTitle
            currentTitle
          }
          ... on MilestonedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            milestoneTitle
          }
          ... on DemilestonedEvent {
            id
            createdAt
            actor { login avatarUrl ... on User { databaseId } }
            milestoneTitle
          }
        }
      }
      comments(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          databaseId
          author { login avatarUrl ... on User { databaseId } }
          body
          createdAt
          updatedAt
          reactions(first: 1) { totalCount }
          reactionGroups {
            content
            users(first: 1) { totalCount }
          }
        }
      }
    }
  }
}`;

/**
 * Timeline items imported per issue and hydration pass. GitHub returns the
 * newest items first when paginating backwards (`last`), so this is a window,
 * not a full history: deeper timeline history is intentionally not imported.
 */
export const TIMELINE_EVENT_LIMIT = 50;

/** Default history window when settings are unavailable (mirrors settings). */
const DEFAULT_HISTORY_DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * Follow-up comment page for issues whose first page reported more comments.
 * Only issued for those issues, keyed by node id and the previous `endCursor`.
 */
export const COMMENTS_QUERY = `query FunnelComments($id: ID!, $after: String) {
  node(id: $id) {
    ... on Issue {
      comments(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          databaseId
          author { login avatarUrl ... on User { databaseId } }
          body
          createdAt
          updatedAt
          reactions(first: 1) { totalCount }
          reactionGroups {
            content
            users(first: 1) { totalCount }
          }
        }
      }
    }
  }
}`;

/** Bounded follow-up pages per issue; exceeding it fails closed. */
export const MAX_COMMENT_PAGES = 100;

export type GraphqlFn = (
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

interface GqlActor {
  databaseId?: number | null;
  login?: string | null;
  avatarUrl?: string | null;
}

interface GqlReactionGroup {
  content?: string | null;
  users?: { totalCount?: number | null } | null;
}

interface GqlComment {
  databaseId?: number | null;
  author?: GqlActor | null;
  body?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  reactions?: { totalCount?: number | null } | null;
  reactionGroups?: GqlReactionGroup[] | null;
}

interface GqlPageInfo {
  hasNextPage?: boolean | null;
  endCursor?: string | null;
}

interface GqlCommentConnection {
  nodes?: GqlComment[];
  pageInfo?: GqlPageInfo | null;
}

interface GqlTimelineSource {
  __typename?: string | null;
  number?: number | null;
  title?: string | null;
  url?: string | null;
}

interface GqlTimelineItem {
  __typename?: string | null;
  id?: string | null;
  createdAt?: string | null;
  actor?: GqlActor | null;
  label?: { name?: string | null } | null;
  assignee?: GqlActor | null;
  source?: GqlTimelineSource | null;
  isCrossRepository?: boolean | null;
  commit?: { oid?: string | null } | null;
  previousTitle?: string | null;
  currentTitle?: string | null;
  milestoneTitle?: string | null;
}

interface GqlNode {
  databaseId?: number | null;
  number?: number | null;
  url?: string | null;
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
  timelineItems?: { nodes?: GqlTimelineItem[] } | null;
  comments?: GqlCommentConnection | null;
}

function ms(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toUser(
  actor: GqlActor | null | undefined,
  forge: string,
  instance: string,
): mirror.UserRecord | null {
  if (
    !actor ||
    typeof actor.databaseId !== "number" ||
    typeof actor.login !== "string"
  ) {
    return null;
  }
  return {
    id: 0,
    externalId: String(actor.databaseId),
    forge,
    instance,
    login: actor.login,
    avatarUrl: actor.avatarUrl ?? "",
    url: "",
  };
}

/** Map a comment connection to mirror records, dropping unidentified rows. */
function normalizeComments(
  comments: GqlCommentConnection | null | undefined,
  forge: string,
  instance: string,
): mirror.CommentRecord[] {
  return (comments?.nodes ?? [])
    .filter(
      (c): c is GqlComment & { databaseId: number } =>
        typeof c.databaseId === "number",
    )
    .map((c) => {
      const reactions = normalizeGraphqlReactions(
        c.reactionGroups,
        c.reactions?.totalCount,
      );
      return {
        externalId: String(c.databaseId),
        author: toUser(c.author, forge, instance),
        body: c.body ?? "",
        // Keep the record shape unchanged when a fixture (or a forge) reports
        // no reaction fields at all.
        ...(c.reactionGroups !== undefined || c.reactions !== undefined
          ? { reactions }
          : {}),
        createdAt: ms(c.createdAt) ?? 0,
        updatedAt: ms(c.updatedAt) ?? 0,
      };
    });
}

/**
 * Normalize GraphQL timeline items into mirror event records.
 *
 * Only the GitHub actions Funnel mirrors are kept; comments are skipped
 * because `mirror_comment` already holds them, and unknown node types are
 * dropped safely. Items without a stable id or a parseable timestamp are
 * skipped; a missing actor degrades to `null` instead of failing the batch.
 */
export function normalizeTimelineItems(
  items: readonly GqlTimelineItem[] | null | undefined,
  forge = "github",
  instance = "github.com",
): mirror.TimelineEventRecord[] {
  const events: mirror.TimelineEventRecord[] = [];
  for (const item of items ?? []) {
    const type = item.__typename;
    if (typeof type !== "string" || type.includes("Comment")) continue;
    if (typeof item.id !== "string" || item.id.length === 0) continue;
    const occurredAt = ms(item.createdAt);
    if (occurredAt === null) continue;

    const label = item.label?.name ?? null;
    const assignee = item.assignee?.login ?? null;
    const source = item.source ?? null;
    const sourceNumber =
      typeof source?.number === "number" ? source.number : null;
    const sourceTitle = source?.title ?? null;
    const sourceUrl = source?.url ?? null;
    const detail: MirrorIssueEventDetail = {};

    let kind: string;
    let action: string;
    let summary: string;

    switch (type) {
      case "LabeledEvent":
        kind = "label";
        action = "labelled";
        summary = `added label "${label ?? "unknown"}"`;
        if (label) detail.label = label;
        break;
      case "UnlabeledEvent":
        kind = "label";
        action = "unlabelled";
        summary = `removed label "${label ?? "unknown"}"`;
        if (label) detail.label = label;
        break;
      case "AssignedEvent":
        kind = "assignment";
        action = "assigned";
        summary = assignee ? `assigned @${assignee}` : "assigned an issue";
        if (assignee) detail.assignee = assignee;
        break;
      case "UnassignedEvent":
        kind = "assignment";
        action = "unassigned";
        summary = assignee
          ? `unassigned @${assignee}`
          : "unassigned an issue";
        if (assignee) detail.assignee = assignee;
        break;
      case "ClosedEvent":
        kind = "state_change";
        action = "closed";
        summary = "closed this issue";
        break;
      case "ReopenedEvent":
        kind = "state_change";
        action = "reopened";
        summary = "reopened this issue";
        break;
      case "CrossReferencedEvent":
        kind = "referenced";
        action = "cross-referenced";
        summary =
          sourceNumber === null
            ? "cross-referenced this issue"
            : `cross-referenced this issue from #${sourceNumber}`;
        if (source?.__typename) detail.sourceType = source.__typename;
        if (sourceNumber !== null) detail.sourceNumber = sourceNumber;
        if (sourceTitle) detail.sourceTitle = sourceTitle;
        if (sourceUrl) detail.sourceUrl = sourceUrl;
        break;
      case "ReferencedEvent": {
        kind = "referenced";
        action = "referenced";
        const oid = item.commit?.oid ?? null;
        summary = oid
          ? `referenced this issue in commit ${oid.slice(0, 7)}`
          : "referenced this issue";
        if (oid) detail.reference = oid;
        break;
      }
      case "MentionedEvent":
        kind = "mention";
        action = "mentioned";
        summary = "was mentioned in a comment";
        break;
      case "RenamedTitleEvent": {
        kind = "other";
        action = "renamed";
        const previous = item.previousTitle ?? null;
        const current = item.currentTitle ?? null;
        summary =
          previous === null
            ? `renamed the title to "${current ?? ""}"`
            : `renamed the title from "${previous}" to "${current ?? ""}"`;
        if (previous !== null) detail.from = previous;
        if (current !== null) detail.to = current;
        break;
      }
      case "MilestonedEvent":
        kind = "other";
        action = "added";
        summary = `added milestone "${item.milestoneTitle ?? "unknown"}"`;
        if (item.milestoneTitle) detail.milestone = item.milestoneTitle;
        break;
      case "DemilestonedEvent":
        kind = "other";
        action = "removed";
        summary = `removed milestone "${item.milestoneTitle ?? "unknown"}"`;
        if (item.milestoneTitle) detail.milestone = item.milestoneTitle;
        break;
      default:
        continue;
    }

    events.push({
      externalId: item.id,
      kind,
      action,
      summary,
      actor: toUser(item.actor, forge, instance),
      occurredAt,
      detail: Object.keys(detail).length > 0 ? detail : null,
    });
  }
  return events;
}

/**
 * Convert one GraphQL node to a mirror record. Returns `null` for PRs (the
 * `... on Issue` fragment leaves them empty) and anything missing identity.
 * The node carries no forge identity, so callers that know the repository
 * pass its `forge`/`instance`; the defaults target github.com.
 */
export function normalizeNode(
  node: GqlNode | null | undefined,
  repoId: number,
  forge = "github",
  instance = "github.com",
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
    .map((actor) => toUser(actor, forge, instance))
    .filter((u): u is mirror.UserRecord => u !== null);

  const comments = normalizeComments(node.comments, forge, instance);
  let events: mirror.TimelineEventRecord[] = [];
  try {
    events = normalizeTimelineItems(node.timelineItems?.nodes, forge, instance);
  } catch (error) {
    // Timeline history is useful context, never a reason to lose the issue.
    log.warn(
      { number: node.number, ...errorFields(error) },
      "timeline normalization failed",
    );
  }

  return {
    externalId: String(node.databaseId),
    repoId,
    number: node.number,
    kind: "issue",
    title: node.title ?? "",
    body: node.body ?? "",
    state: (node.state ?? "open").toLowerCase(),
    stateReason: node.stateReason?.toLowerCase() ?? null,
    author: toUser(node.author, forge, instance),
    milestoneNumber:
      typeof node.milestone?.number === "number" ? node.milestone.number : null,
    url: node.url ?? "",
    createdAt,
    updatedAt,
    closedAt: ms(node.closedAt),
    labels,
    assignees,
    comments,
    events,
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

/**
 * Build the post-upsert planner snapshot from the hydrated record and the
 * metadata derived for it, avoiding a re-read of the rows just written.
 */
function snapshotFromRecord(
  record: mirror.IssueRecord,
  metadata: mirror.StoredMetadata,
): IssueSnapshot {
  return {
    status: metadata.status ?? "",
    priority: metadata.priority ?? "",
    state: record.state,
    updatedAt: record.updatedAt,
    assigneeIds: record.assignees.map((assignee) => assignee.externalId),
    comments: record.comments.map((comment) => ({
      externalId: comment.externalId,
      body: comment.body,
      ...(comment.author
        ? {
            authorLogin: comment.author.login,
            authorAvatarUrl: comment.author.avatarUrl,
          }
        : {}),
    })),
    title: record.title,
    number: record.number,
  };
}

/**
 * The state the actual-time recorder diffs. `IssueSnapshot` belongs to the
 * notification planner and carries no blocked flag; transitions need only the
 * status, state and blocked dimensions, so they get their own snapshot shape.
 */
function transitionSnapshotFromRecord(
  record: mirror.IssueRecord,
  metadata: mirror.StoredMetadata,
): IssueTransitionSnapshot {
  return {
    status: metadata.status ?? "",
    state: record.state,
    blocked: metadata.blocked,
    priority: metadata.priority,
    labels: record.labels,
    assignees: record.assignees.map((assignee) => assignee.login),
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
  const externalId = account?.accountId;
  return externalId ? getRecipientByExternalId(externalId) : null;
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

  const externalIds = new Set(input.next.assigneeIds);
  for (const user of mirror.getRepoAssignees(input.repoId)) {
    externalIds.add(user.externalId);
  }
  for (const recipient of getRecipientsByExternalIds([...externalIds]).values()) {
    add(recipient);
  }

  const knownComments = new Set(
    (input.previous?.comments ?? []).map((comment) => comment.externalId),
  );
  const logins = new Set<string>();
  for (const comment of input.next.comments) {
    if (knownComments.has(comment.externalId)) continue;
    if (comment.authorLogin) logins.add(comment.authorLogin);
    for (const login of parseMentions(comment.body)) logins.add(login);
  }
  for (const recipient of getRecipientsByLogins([...logins]).values()) {
    add(recipient);
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

/**
 * Follow `node(id:)` comment pages until the connection reports no more.
 * Pages append in order and are de-duplicated by `externalId`. A page that
 * claims another page without an `endCursor`, or a runaway server, throws so a
 * partial list never reaches the caller.
 */
async function hydrateRemainingComments(
  graphqlFn: GraphqlFn,
  nodeId: string | undefined,
  firstPage: readonly mirror.CommentRecord[],
  firstCursor: string | null | undefined,
  forge: string,
  instance: string,
): Promise<mirror.CommentRecord[]> {
  if (typeof nodeId !== "string") {
    throw new Error("comment pagination needs the node id");
  }
  let after = firstCursor;
  if (!after) {
    throw new Error("comment pagination reported hasNextPage without an endCursor");
  }

  const byId = new Map<string, mirror.CommentRecord>();
  for (const comment of firstPage) byId.set(comment.externalId, comment);

  for (let pages = 1; ; pages += 1) {
    if (pages > MAX_COMMENT_PAGES) {
      throw new Error(
        `comment pagination exceeded ${MAX_COMMENT_PAGES} pages for node ${nodeId}`,
      );
    }
    const result = (await graphqlFn(COMMENTS_QUERY, { id: nodeId, after })) as {
      node?: { comments?: GqlCommentConnection | null } | null;
    };
    const connection = result?.node?.comments;
    if (!connection) {
      throw new Error(
        `comment pagination lost node ${nodeId} on page ${pages}`,
      );
    }
    for (const comment of normalizeComments(connection, forge, instance)) {
      if (!byId.has(comment.externalId)) byId.set(comment.externalId, comment);
    }
    const pageInfo = connection?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    if (!pageInfo.endCursor) {
      throw new Error(
        "comment pagination reported hasNextPage without an endCursor",
      );
    }
    after = pageInfo.endCursor;
  }

  return [...byId.values()];
}

/** Hydrate node ids into records without touching the database. */
export async function hydrateNodes(
  graphqlFn: GraphqlFn,
  repoId: number,
  nodeIds: readonly string[],
  forge = "github",
  instance = "github.com",
  since?: string,
): Promise<mirror.IssueRecord[]> {
  const records: mirror.IssueRecord[] = [];
  for (const ids of chunk(nodeIds, BATCH_SIZE)) {
    const result = (await graphqlFn(HYDRATE_QUERY, {
      ids,
      ...(since ? { since } : {}),
    })) as {
      nodes?: Array<GqlNode | null>;
    };
    const nodes = result?.nodes ?? [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const record = normalizeNode(node, repoId, forge, instance);
      if (!record) continue;
      const pageInfo = node?.comments?.pageInfo;
      if (pageInfo?.hasNextPage) {
        record.comments = await hydrateRemainingComments(
          graphqlFn,
          ids[index],
          record.comments,
          pageInfo.endCursor,
          forge,
          instance,
        );
      }
      records.push(record);
    }
  }
  return records;
}

export interface HydrateOptions {
  /** The signed-in Funnel user whose write triggered this refresh. */
  actorUserId?: string;
  /** Configured vocabulary; resolved from settings when omitted. */
  vocabulary?: ReservedVocabulary;
  /** Test seam: replace the whole change hook. */
  notify?: (input: IssueChangeInput) => number;
  /** Test seam: override the instance's enabled switch. */
  notificationsEnabled?: () => boolean | Promise<boolean>;
  /**
   * Timeline history cutoff. Defaults to `now - sync.history_days` so the
   * timeline window matches the issue mirror's own retention window.
   */
  since?: string | Date;
}

/** The timeline cutoff for this hydration pass, as an ISO DateTime. */
function timelineSince(override?: string | Date): string {
  if (override instanceof Date) return override.toISOString();
  if (typeof override === "string" && override.length > 0) return override;
  let days = DEFAULT_HISTORY_DAYS;
  try {
    days = readSettings().sync.history_days;
  } catch {
    // Settings failures must not block hydration; use the documented default.
  }
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * The configured vocabulary for this hydration pass. Reads the setting
 * directly (like the notification switch) so a failed config load degrades to
 * the default vocabulary instead of aborting the mirror.
 */
function configuredVocabulary(): ReservedVocabulary {
  try {
    return buildVocabulary(readSettings().labels.prefix);
  } catch {
    return DEFAULT_VOCABULARY;
  }
}

/**
 * Whether the instance-wide notification master switch is on (default true).
 *
 * Read the setting directly instead of the validated instance config: an
 * unrelated invalid setting must not turn a disabled master switch into an
 * enabled one and start creating notification rows.
 */
async function notificationsEnabled(): Promise<boolean> {
  try {
    return readSettings().notifications.enabled;
  } catch {
    // Settings failures must not block mirror hydration.
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
  const provider = graphqlFn
    ? undefined
    : await forge.installationProvider(installationId);
  const gql: GraphqlFn =
    graphqlFn ?? ((query, variables) => provider!.graphql(query, variables));
  // The node has no forge identity of its own; use the mirrored repo's.
  const repo = mirror.getRepo(repoId);
  const repoLabel = repo ? `${repo.org}/${repo.name}` : null;
  const batches = Math.ceil(nodeIds.length / BATCH_SIZE);
  const startedAt = Date.now();
  log.debug(
    { repo: repoLabel, requested: nodeIds.length, batches },
    "hydration started",
  );
  let records: mirror.IssueRecord[];
  try {
    records = await hydrateNodes(
      gql,
      repoId,
      nodeIds,
      repo?.forge ?? "github",
      repo?.instance ?? "github.com",
      timelineSince(options.since),
    );
  } catch (error) {
    log.warn(
      {
        repo: repoLabel,
        requested: nodeIds.length,
        batches,
        ...errorFields(error),
      },
      "hydration failed",
    );
    throw error;
  }
  log.debug(
    {
      repo: repoLabel,
      requested: nodeIds.length,
      hydrated: records.length,
      batches,
      durationMs: Date.now() - startedAt,
    },
    "hydration finished",
  );
  const enabled = options.notificationsEnabled
    ? await options.notificationsEnabled()
    : await notificationsEnabled();
  const notify = options.notify ?? notifyIssueChanges;
  const vocabulary = options.vocabulary ?? configuredVocabulary();

  // Snapshot every issue's previous state before the batch write; a missing
  // row means a first sighting. The transition recorder needs its snapshot even
  // when notifications are disabled.
  const previousByNumber = new Map<number, IssueSnapshot>();
  const previousTransitions = new Map<number, IssueTransitionSnapshot>();
  if (repo) {
    for (const record of records) {
      const row = mirror.getIssue(repoId, record.number);
      if (!row) continue;
      previousTransitions.set(record.number, {
        status: row.status ?? "",
        state: row.state,
        blocked: row.blocked === 1,
        priority: row.priority,
        labels: mirror.getIssueLabels(repoId, record.number),
        assignees: mirror.getIssueAssigneeLogins(repoId, record.number),
      });
      const previous = snapshotIssue(repoId, record.number);
      if (previous) previousByNumber.set(record.number, previous);
    }
  }

  const metadataByNumber = new Map<number, mirror.StoredMetadata>();
  mirror.upsertIssues(
    records,
    (record) => {
      const derived = deriveMetadata(record.labels, vocabulary);
      const metadata: mirror.StoredMetadata = {
        status: derived.status,
        impact: derived.impact,
        urgency: derived.urgency,
        priority: derived.priority,
        size: derived.size,
        blocked: derived.blocked,
        isEpic: derived.isEpic,
        labelConflict: derived.conflicts.length > 0,
      };
      metadataByNumber.set(record.number, metadata);
      return metadata;
    },
    vocabulary,
  );

  if (!repo) return records;

  // GitHub-native relationships are hydrated after the issue itself, in two
  // isolated queries. A host that rejects either field set leaves its prior
  // rows untouched and never fails the issue upsert above.
  await syncIssueRelations(gql, repo, nodeIds);

  // Record observed transitions before notifying: the event log and automatic
  // delays must reflect the same observation, whether or not notifications
  // are enabled.
  const observedAt = Date.now();
  for (const record of records) {
    const metadata = metadataByNumber.get(record.number);
    if (!metadata) continue;
    try {
      recordIssueTransitions({
        org: repo.org,
        name: repo.name,
        issueNumber: record.number,
        previous: previousTransitions.get(record.number) ?? null,
        next: transitionSnapshotFromRecord(record, metadata),
        body: record.body,
        at: observedAt,
        closedAt: record.closedAt,
        source: "sync",
      });
    } catch (error) {
      // A transition failure is logged, never allowed to fail the mirror.
      log.warn(
        {
          repo: `${repo.org}/${repo.name}`,
          number: record.number,
          err: error,
        },
        "transition recorder failed",
      );
    }
  }

  if (!enabled) return records;

  for (const record of records) {
    const previous = previousByNumber.get(record.number);
    const metadata = metadataByNumber.get(record.number);
    if (!previous || !metadata) continue;
    const next = snapshotFromRecord(record, metadata);
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
