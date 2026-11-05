/**
 * Drizzle read/write helpers for the disposable forge-neutral `mirror_*` cache
 * (SPEC §7.1). Everything here is rebuildable from the forge: the sync worker
 * upserts hydrated records, the conflict resolver rewrites label assignments,
 * and reconciliation prunes rows that no longer exist upstream.
 *
 * Internal integer ids are the only FK targets. Repositories and users are
 * identified externally by `(forge, instance, external_id)`; threads by
 * `(repo_id, number)` and comments by `(repo_id, external_id)`. The junction
 * tables (`mirror_thread_label`, `mirror_thread_assignee`) carry no FK to the
 * thread row (see `db/schema.ts`), so deletes remove children explicitly
 * before the parent.
 *
 * The per-repo polling cursor is *derived*, not stored: it is the newest
 * `updated_at` mirrored for the repo (SPEC §7.2). Forge `since` is inclusive,
 * so re-sending that boundary thread is an idempotent upsert.
 */
import { and, asc, eq, inArray, max, notInArray, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { bumpRevision } from "./revision";
import {
  mirrorComment,
  mirrorIssuePullRequest,
  mirrorMilestone,
  mirrorPullRequest,
  mirrorRepo,
  mirrorRepoAssignee,
  mirrorRepoLabel,
  mirrorThread,
  mirrorThreadAssignee,
  mirrorThreadLabel,
  mirrorUser,
} from "#lib/server/db/schema";
import {
  DEFAULT_VOCABULARY,
  type ReservedVocabulary,
} from "#lib/labels";
import {
  priorityRank,
  retiredPriorityConflict,
  type Impact,
  type Priority,
  type Urgency,
} from "#lib/priority";
import type { CommentReactions } from "#lib/reactions";

export type RepoRow = typeof mirrorRepo.$inferSelect;

export interface UserRecord {
  /** Internal id; ignored on upsert (SQLite assigns it). */
  id: number;
  externalId: string;
  forge: string;
  instance: string;
  login: string;
  avatarUrl: string;
  url: string;
}

export interface CommentRecord {
  externalId: string;
  author: UserRecord | null;
  body: string;
  /** Aggregate reactions; omitted when the caller has not hydrated them. */
  reactions?: CommentReactions | null;
  createdAt: number;
  updatedAt: number;
}

export interface IssueRecord {
  externalId: string;
  /** Internal repository id, not a forge id. */
  repoId: number;
  number: number;
  kind: "issue";
  title: string;
  body: string;
  state: string;
  stateReason: string | null;
  author: UserRecord | null;
  /** The issue's milestone number in its repo, or `null` when unmilestoned. */
  milestoneNumber: number | null;
  url: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  labels: string[];
  assignees: UserRecord[];
  comments: CommentRecord[];
}

export interface PullRequestChecks {
  state: "pending" | "success" | "failure" | "unknown";
  total: number | null;
  failed: number | null;
  url: string | null;
}

/** One linked pull request reduced to the development context the cockpit shows. */
export interface PullRequestRecord {
  repoId: number;
  number: number;
  externalId: string;
  title: string;
  state: "open" | "closed" | "merged" | "unknown";
  isDraft: boolean;
  merged: boolean;
  reviewDecision:
    | "approved"
    | "changes_requested"
    | "review_required"
    | "pending"
    | null;
  approvedCount: number;
  changesRequestedCount: number;
  pendingReviewCount: number;
  checks: PullRequestChecks | null;
  url: string;
  author: UserRecord | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  mergedAt: number | null;
}

export interface IssuePullRequestLink {
  repoId: number;
  issueNumber: number;
  prNumber: number;
  source: "closing" | "cross-reference";
}

/** Cached reserved-label derivation stored on the thread row (SPEC §5.2). */
export interface StoredMetadata {
  status: string | null;
  impact: Impact | null;
  urgency: Urgency | null;
  /** Derived `P1`–`P3`, or `null` when neither axis is assessed. */
  priority: Priority | null;
  size: string | null;
  /** Orthogonal `blocked` flag, stored as 0/1 (SPEC §5.1). */
  blocked: boolean;
  /**
   * `epic` type label cache. Optional so older stored-metadata callers keep
   * compiling; the writer falls back to the issue's labels when it is absent.
   */
  isEpic?: boolean;
  labelConflict: boolean;
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/** True when both lists hold the same string values, ignoring order. */
function sameStringMultiset(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

/** True when `existing` holds exactly the ids in `incoming`. */
function sameIdSet(
  existing: readonly number[],
  incoming: ReadonlySet<number>,
): boolean {
  if (existing.length !== incoming.size) return false;
  return existing.every((id) => incoming.has(id));
}

// ---------------------------------------------------------------------------
// Repos
// ---------------------------------------------------------------------------

export function upsertRepo(input: {
  externalId: string;
  forge: string;
  instance: string;
  org: string;
  name: string;
  url: string;
  archived: boolean;
}): RepoRow {
  const archived = input.archived ? 1 : 0;
  db.insert(mirrorRepo)
    .values({
      forge: input.forge,
      instance: input.instance,
      externalId: input.externalId,
      org: input.org,
      name: input.name,
      url: input.url,
      archived,
    })
    .onConflictDoUpdate({
      target: [mirrorRepo.forge, mirrorRepo.instance, mirrorRepo.externalId],
      set: {
        org: input.org,
        name: input.name,
        url: input.url,
        archived,
      },
    })
    .run();
  const row = getRepoByIdentity(input.forge, input.instance, input.externalId);
  if (!row) {
    throw new Error(
      `repo ${input.forge}/${input.instance}/${input.externalId} missing after upsert`,
    );
  }
  bumpRevision();
  return row;
}

function getRepoByIdentity(
  forge: string,
  instance: string,
  externalId: string,
): RepoRow | undefined {
  return db
    .select()
    .from(mirrorRepo)
    .where(
      and(
        eq(mirrorRepo.forge, forge),
        eq(mirrorRepo.instance, instance),
        eq(mirrorRepo.externalId, externalId),
      ),
    )
    .get();
}

/** One mirrored repo by its internal id (`RepoRow.id`). */
export function getRepo(id: number): RepoRow | undefined {
  return db.select().from(mirrorRepo).where(eq(mirrorRepo.id, id)).get();
}

export function getRepoBySlug(
  forge: string,
  instance: string,
  org: string,
  name: string,
): RepoRow | undefined {
  return db
    .select()
    .from(mirrorRepo)
    .where(
      and(
        eq(mirrorRepo.forge, forge),
        eq(mirrorRepo.instance, instance),
        eq(mirrorRepo.org, org),
        eq(mirrorRepo.name, name),
      ),
    )
    .get();
}

/**
 * Slug-only lookup kept for callers that predate forge-aware repos (HTTP
 * routes). New code should use {@link getRepoBySlug} with an explicit forge
 * identity; this returns the first match across instances.
 */
export function getRepoByOrgName(
  org: string,
  name: string,
): RepoRow | undefined {
  return db
    .select()
    .from(mirrorRepo)
    .where(and(eq(mirrorRepo.org, org), eq(mirrorRepo.name, name)))
    .get();
}

export function listRepos(): RepoRow[] {
  return db.select().from(mirrorRepo).all();
}

export function setRepoEtag(repoId: number, etag: string | null): void {
  db.update(mirrorRepo)
    .set({ etag })
    .where(eq(mirrorRepo.id, repoId))
    .run();
}

export function setRepoPolledAt(repoId: number, at: number): void {
  db.update(mirrorRepo)
    .set({ lastPolledAt: at })
    .where(eq(mirrorRepo.id, repoId))
    .run();
}

export function setRepoReconciledAt(repoId: number, at: number): void {
  db.update(mirrorRepo)
    .set({ lastReconciledAt: at })
    .where(eq(mirrorRepo.id, repoId))
    .run();
}

export function setRepoDegraded(repoId: number, degraded: boolean): void {
  db.update(mirrorRepo)
    .set({ degraded: degraded ? 1 : 0 })
    .where(eq(mirrorRepo.id, repoId))
    .run();
}

/** Newest `updated_at` mirrored for a repo; `null` before the first backfill. */
export function getRepoCursor(repoId: number): number | null {
  const row = db
    .select({ value: max(mirrorThread.updatedAt) })
    .from(mirrorThread)
    .where(eq(mirrorThread.repoId, repoId))
    .get();
  return row?.value ?? null;
}

// ---------------------------------------------------------------------------
// Users & repo labels
// ---------------------------------------------------------------------------

/** One mirrored person by forge-native identity, or `undefined` before seen. */
export function getUser(
  externalId: string,
  forge: string,
  instance: string,
): UserRecord | undefined {
  return db
    .select()
    .from(mirrorUser)
    .where(
      and(
        eq(mirrorUser.forge, forge),
        eq(mirrorUser.instance, instance),
        eq(mirrorUser.externalId, externalId),
      ),
    )
    .get();
}

/**
 * Rows per multi-row user write. Six bound values each keeps the statement
 * below SQLite's conservative 999-variable ceiling.
 */
const USER_WRITE_CHUNK = 100;

/**
 * Upsert a batch of people on `(forge, instance, external_id)` and return
 * their internal ids keyed by {@link userKey}. Duplicates in the input are
 * collapsed, so each person costs one row in the statement.
 */
export function upsertUsers(users: readonly UserRecord[]): Map<string, number> {
  return upsertUsersIn(db, users);
}

function upsertUsersIn(
  exec: Pick<MirrorTx, "insert">,
  users: readonly UserRecord[],
): Map<string, number> {
  const unique = new Map<string, UserRecord>();
  for (const user of users) unique.set(userKey(user), user);
  const ids = new Map<string, number>();
  const rows = [...unique.values()];
  for (let i = 0; i < rows.length; i += USER_WRITE_CHUNK) {
    const returned = exec
      .insert(mirrorUser)
      .values(
        rows.slice(i, i + USER_WRITE_CHUNK).map((user) => ({
          forge: user.forge,
          instance: user.instance,
          externalId: user.externalId,
          login: user.login,
          avatarUrl: user.avatarUrl,
          url: user.url,
        })),
      )
      .onConflictDoUpdate({
        target: [mirrorUser.forge, mirrorUser.instance, mirrorUser.externalId],
        set: {
          login: sql`excluded.login`,
          avatarUrl: sql`excluded.avatar_url`,
          url: sql`excluded.url`,
        },
      })
      .returning({
        id: mirrorUser.id,
        forge: mirrorUser.forge,
        instance: mirrorUser.instance,
        externalId: mirrorUser.externalId,
      })
      .all();
    for (const row of returned) ids.set(userKey(row), row.id);
  }
  if (ids.size !== unique.size) {
    throw new Error(
      `user batch missing ${unique.size - ids.size} rows after upsert`,
    );
  }
  return ids;
}

/**
 * Upsert a person on `(forge, instance, external_id)` and return the internal
 * row. The input `id` is ignored: only SQLite assigns internal ids.
 */
export function upsertUser(user: UserRecord): UserRecord {
  const id = upsertUsers([user]).get(userKey(user));
  if (id === undefined) {
    throw new Error(
      `user ${user.forge}/${user.instance}/${user.externalId} missing after upsert`,
    );
  }
  const row = db.select().from(mirrorUser).where(eq(mirrorUser.id, id)).get();
  if (!row) {
    throw new Error(
      `user ${user.forge}/${user.instance}/${user.externalId} missing after upsert`,
    );
  }
  return row;
}

function userKey(user: {
  forge: string;
  instance: string;
  externalId: string;
}): string {
  return `${user.forge}\u0000${user.instance}\u0000${user.externalId}`;
}

/** Internal id for an already-upserted user; throws if the map is incomplete. */
function requireUserId(
  ids: ReadonlyMap<string, number>,
  user: UserRecord,
): number {
  const id = ids.get(userKey(user));
  if (id === undefined) {
    throw new Error(
      `user ${user.forge}/${user.instance}/${user.externalId} missing after batch upsert`,
    );
  }
  return id;
}

export interface RepoLabelRecord {
  name: string;
  color: string;
  description: string;
}

function labelFingerprint(label: RepoLabelRecord): string {
  return `${label.name}\u0000${label.color}\u0000${label.description}`;
}

/** True when both label sets carry the same names, colors and descriptions. */
function sameLabelSet(
  a: readonly RepoLabelRecord[],
  b: readonly RepoLabelRecord[],
): boolean {
  return sameStringMultiset(a.map(labelFingerprint), b.map(labelFingerprint));
}

/** Replace a repo's full label set (filter options come from here). */
export function replaceRepoLabels(
  repoId: number,
  labels: readonly RepoLabelRecord[],
): void {
  // Labels rarely change; skip the delete/reinsert when the set is identical.
  if (sameLabelSet(getRepoLabels(repoId), labels)) return;
  db.transaction((tx) => {
    tx.delete(mirrorRepoLabel).where(eq(mirrorRepoLabel.repoId, repoId)).run();
    if (labels.length > 0) {
      tx.insert(mirrorRepoLabel)
        .values(
          labels.map((l) => ({
            repoId,
            name: l.name,
            color: l.color,
            description: l.description,
          })),
        )
        .run();
    }
  });
  bumpRevision();
}

export function getRepoLabels(repoId: number): RepoLabelRecord[] {
  return db
    .select({
      name: mirrorRepoLabel.name,
      color: mirrorRepoLabel.color,
      description: mirrorRepoLabel.description,
    })
    .from(mirrorRepoLabel)
    .where(eq(mirrorRepoLabel.repoId, repoId))
    .all();
}

/**
 * Replace a repo's assignable-user set (the Inspector's assignee picker source,
 * SPEC §9.2). Users are upserted first because they are FK targets.
 */
export function replaceRepoAssignees(
  repoId: number,
  users: readonly UserRecord[],
): void {
  const ids = upsertUsers(users);
  // Users are upserted first (identity may change), but an unchanged assignment
  // set needs no delete/reinsert.
  const existing = getRepoAssignees(repoId).map((user) => user.id);
  if (sameIdSet(existing, new Set(ids.values()))) {
    // Users were upserted above, so their identity may have changed even when
    // the assignment set did not; invalidate cached readers either way.
    bumpRevision();
    return;
  }
  db.transaction((tx) => {
    tx.delete(mirrorRepoAssignee)
      .where(eq(mirrorRepoAssignee.repoId, repoId))
      .run();
    if (ids.size > 0) {
      tx.insert(mirrorRepoAssignee)
        .values([...ids.values()].map((userId) => ({ repoId, userId })))
        .run();
    }
  });
  bumpRevision();
}

export function getRepoAssignees(repoId: number): UserRecord[] {
  return db
    .select({
      id: mirrorUser.id,
      externalId: mirrorUser.externalId,
      forge: mirrorUser.forge,
      instance: mirrorUser.instance,
      login: mirrorUser.login,
      avatarUrl: mirrorUser.avatarUrl,
      url: mirrorUser.url,
    })
    .from(mirrorRepoAssignee)
    .innerJoin(mirrorUser, eq(mirrorRepoAssignee.userId, mirrorUser.id))
    .where(eq(mirrorRepoAssignee.repoId, repoId))
    .orderBy(asc(mirrorUser.login))
    .all();
}

// ---------------------------------------------------------------------------
// Repo milestones
// ---------------------------------------------------------------------------

export interface MilestoneRecord {
  number: number;
  externalId: string;
  title: string;
  description: string;
  state: string;
  dueOn: number | null;
  openIssues: number;
  closedIssues: number;
  creator: UserRecord | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  url: string;
}

type MilestoneRow = typeof mirrorMilestone.$inferInsert;

function milestoneFingerprint(m: MilestoneRow): string {
  return [
    m.number,
    m.externalId,
    m.title,
    m.description,
    m.state,
    m.dueOn ?? "",
    m.openIssues,
    m.closedIssues,
    m.creatorId ?? "",
    m.createdAt,
    m.updatedAt,
    m.closedAt ?? "",
    m.url,
  ]
    .map((value) => String(value))
    .join("\u0000");
}

/** True when both milestone sets carry identical rows. */
function sameMilestoneSet(
  existing: readonly MilestoneRow[],
  incoming: readonly MilestoneRow[],
): boolean {
  if (existing.length !== incoming.length) return false;
  const left = existing.map(milestoneFingerprint).sort();
  const right = incoming.map(milestoneFingerprint).sort();
  return left.every((value, index) => value === right[index]);
}

/**
 * Replace a repo's full milestone set (SPEC §7.1). Milestones are repo-scoped,
 * so the list is swapped wholesale when it changes; the creator is upserted
 * first because it is an FK target. An identical set is left untouched.
 */
export function replaceRepoMilestones(
  repoId: number,
  milestones: readonly MilestoneRecord[],
): void {
  const creatorIds = upsertUsers(
    milestones.flatMap((milestone) =>
      milestone.creator ? [milestone.creator] : [],
    ),
  );
  const creators = milestones.map((milestone) =>
    milestone.creator ? requireUserId(creatorIds, milestone.creator) : null,
  );
  const rows: MilestoneRow[] = milestones.map((m, index) => ({
    repoId,
    number: m.number,
    externalId: m.externalId,
    title: m.title,
    description: m.description,
    state: m.state,
    dueOn: m.dueOn,
    openIssues: m.openIssues,
    closedIssues: m.closedIssues,
    creatorId: creators[index] ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    closedAt: m.closedAt,
    url: m.url,
  }));
  const existing = db
    .select()
    .from(mirrorMilestone)
    .where(eq(mirrorMilestone.repoId, repoId))
    .all();
  if (sameMilestoneSet(existing, rows)) {
    // Milestone creators were upserted above, so their identity may have
    // changed even when the milestone set did not; invalidate cached readers.
    bumpRevision();
    return;
  }

  db.transaction((tx) => {
    tx.delete(mirrorMilestone)
      .where(eq(mirrorMilestone.repoId, repoId))
      .run();
    if (rows.length > 0) {
      tx.insert(mirrorMilestone).values(rows).run();
    }
  });
  bumpRevision();
}

/** One repo's milestones ordered by due date (SQLite sorts `NULL` first). */
export function getRepoMilestones(repoId: number): MilestoneRecord[] {
  return db
    .select({
      number: mirrorMilestone.number,
      externalId: mirrorMilestone.externalId,
      title: mirrorMilestone.title,
      description: mirrorMilestone.description,
      state: mirrorMilestone.state,
      dueOn: mirrorMilestone.dueOn,
      openIssues: mirrorMilestone.openIssues,
      closedIssues: mirrorMilestone.closedIssues,
      creatorId: mirrorUser.id,
      creatorExternalId: mirrorUser.externalId,
      creatorForge: mirrorUser.forge,
      creatorInstance: mirrorUser.instance,
      creatorLogin: mirrorUser.login,
      creatorAvatar: mirrorUser.avatarUrl,
      creatorUrl: mirrorUser.url,
      createdAt: mirrorMilestone.createdAt,
      updatedAt: mirrorMilestone.updatedAt,
      closedAt: mirrorMilestone.closedAt,
      url: mirrorMilestone.url,
    })
    .from(mirrorMilestone)
    .leftJoin(mirrorUser, eq(mirrorMilestone.creatorId, mirrorUser.id))
    .where(eq(mirrorMilestone.repoId, repoId))
    .orderBy(asc(mirrorMilestone.dueOn))
    .all()
    .map((row) => ({
      number: row.number,
      externalId: row.externalId,
      title: row.title,
      description: row.description,
      state: row.state,
      dueOn: row.dueOn,
      openIssues: row.openIssues,
      closedIssues: row.closedIssues,
      creator:
        row.creatorId !== null && row.creatorLogin !== null
          ? {
              id: row.creatorId,
              externalId: row.creatorExternalId ?? "",
              forge: row.creatorForge ?? "",
              instance: row.creatorInstance ?? "",
              login: row.creatorLogin,
              avatarUrl: row.creatorAvatar ?? "",
              url: row.creatorUrl ?? "",
            }
          : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      closedAt: row.closedAt,
      url: row.url,
    }));
}

// ---------------------------------------------------------------------------
// Threads (issues)
// ---------------------------------------------------------------------------

/**
 * Rows per multi-row comment write. Seven bound values each keeps the
 * statement below SQLite's conservative 999-variable ceiling.
 */
const COMMENT_WRITE_CHUNK = 100;

type MirrorTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface PreparedComment {
  externalId: string;
  authorId: number | null;
  body: string;
  reactions: CommentReactions | null;
  createdAt: number;
  updatedAt: number;
}

interface PreparedIssue {
  issue: IssueRecord;
  metadata: StoredMetadata;
  authorId: number | null;
  assigneeIds: number[];
  comments: PreparedComment[];
}

/** Every distinct person referenced by a batch of issues. */
function collectIssueUsers(issues: readonly IssueRecord[]): UserRecord[] {
  const users = new Map<string, UserRecord>();
  const add = (user: UserRecord | null): void => {
    if (user) users.set(userKey(user), user);
  };
  for (const issue of issues) {
    add(issue.author);
    for (const assignee of issue.assignees) add(assignee);
    for (const comment of issue.comments) add(comment.author);
  }
  return [...users.values()];
}

function prepareIssue(
  issue: IssueRecord,
  metadata: StoredMetadata,
  userIds: ReadonlyMap<string, number>,
): PreparedIssue {
  return {
    issue,
    metadata,
    authorId: issue.author ? requireUserId(userIds, issue.author) : null,
    assigneeIds: [
      ...new Set(
        issue.assignees.map((assignee) => requireUserId(userIds, assignee)),
      ),
    ],
    comments: issue.comments.map((comment) => ({
      externalId: comment.externalId,
      authorId: comment.author
        ? requireUserId(userIds, comment.author)
        : null,
      body: comment.body,
      reactions: comment.reactions ?? null,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    })),
  };
}

/** Persisted sort rank: P1 → 0 … P3 → 2; unprioritized sorts last. */
function storedPriorityRank(priority: Priority | null): number {
  return priority === null ? 3 : priorityRank(priority);
}

/**
 * Replace the FTS row for one thread. The virtual table has no primary key, so
 * delete-then-insert is the portable upsert. `comments` holds every mirrored
 * comment body, which keeps searching an old comment working after edits.
 */
function writeSearchRow(
  tx: MirrorTx,
  repoId: number,
  number: number,
  title: string,
  body: string,
  comments: readonly string[],
): void {
  tx.run(
    sql`DELETE FROM mirror_thread_fts WHERE repo_id = ${repoId} AND number = ${number}`,
  );
  tx.run(
    sql`INSERT INTO mirror_thread_fts (title, body, comments, repo_id, number)
        VALUES (${title}, ${body}, ${comments.join("\n")}, ${repoId}, ${number})`,
  );
}

/**
 * Rebuild the FTS row from the current mirror state. Used by write paths that
 * update `mirror_thread`/`mirror_comment` directly (the demo provider) rather
 * than through {@link upsertIssues}.
 */
export function refreshIssueSearchIndex(repoId: number, number: number): void {
  const thread = db
    .select({ title: mirrorThread.title, body: mirrorThread.body })
    .from(mirrorThread)
    .where(
      and(eq(mirrorThread.repoId, repoId), eq(mirrorThread.number, number)),
    )
    .get();
  db.transaction((tx) => {
    if (!thread) {
      tx.run(
        sql`DELETE FROM mirror_thread_fts WHERE repo_id = ${repoId} AND number = ${number}`,
      );
      return;
    }
    const comments = tx
      .select({ body: mirrorComment.body })
      .from(mirrorComment)
      .where(
        and(
          eq(mirrorComment.repoId, repoId),
          eq(mirrorComment.threadNumber, number),
        ),
      )
      .orderBy(asc(mirrorComment.createdAt), asc(mirrorComment.id))
      .all()
      .map((row) => row.body);
    writeSearchRow(tx, repoId, number, thread.title, thread.body, comments);
  });
}

/** Write one prepared issue and its children inside the caller's transaction. */
function writeIssue(
  tx: MirrorTx,
  prepared: PreparedIssue,
  vocabulary: ReservedVocabulary,
): void {
  const { issue, metadata, authorId, assigneeIds, comments } = prepared;

  // A matching retired p-label is just stale; a mismatching one is a conflict
  // the UI should surface, exactly like an ambiguous reserved-label timeline.
  const labelConflict =
    metadata.labelConflict ||
    retiredPriorityConflict(metadata.priority, issue.labels);

  // `epic` is a type marker, independent of status and the blocked flag. The
  // label set is authoritative; metadata just caches the derivation. Older
  // callers may omit `isEpic`, so resolve the actual configured name (which is
  // `epic` itself only at the default prefix).
  const epicName = (
    vocabulary.byBase.get("epic")?.name ?? "epic"
  ).toLowerCase();
  const isEpic =
    metadata.isEpic ??
    issue.labels.some((label) => label.toLowerCase() === epicName);

  tx.insert(mirrorThread)
    .values({
      repoId: issue.repoId,
      number: issue.number,
      externalId: issue.externalId,
      kind: issue.kind,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      stateReason: issue.stateReason,
      authorId,
      milestoneNumber: issue.milestoneNumber,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt,
      status: metadata.status,
      impact: metadata.impact,
      urgency: metadata.urgency,
      priority: metadata.priority,
      priorityRank: storedPriorityRank(metadata.priority),
      size: metadata.size,
      blocked: metadata.blocked ? 1 : 0,
      isEpic: isEpic ? 1 : 0,
      labelConflict: labelConflict ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [mirrorThread.repoId, mirrorThread.number],
      set: {
        externalId: issue.externalId,
        kind: issue.kind,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        stateReason: issue.stateReason,
        authorId,
        milestoneNumber: issue.milestoneNumber,
        url: issue.url,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        closedAt: issue.closedAt,
        status: metadata.status,
        impact: metadata.impact,
        urgency: metadata.urgency,
        priority: metadata.priority,
        priorityRank: storedPriorityRank(metadata.priority),
        size: metadata.size,
        blocked: metadata.blocked ? 1 : 0,
        isEpic: isEpic ? 1 : 0,
        labelConflict: labelConflict ? 1 : 0,
      },
    })
    .run();

  const mirroredLabels = tx
    .select({ name: mirrorThreadLabel.labelName })
    .from(mirrorThreadLabel)
    .where(
      and(
        eq(mirrorThreadLabel.repoId, issue.repoId),
        eq(mirrorThreadLabel.threadNumber, issue.number),
      ),
    )
    .all()
    .map((row) => row.name);
  if (!sameStringMultiset(mirroredLabels, issue.labels)) {
    tx.delete(mirrorThreadLabel)
      .where(
        and(
          eq(mirrorThreadLabel.repoId, issue.repoId),
          eq(mirrorThreadLabel.threadNumber, issue.number),
        ),
      )
      .run();
    if (issue.labels.length > 0) {
      tx.insert(mirrorThreadLabel)
        .values(
          issue.labels.map((labelName) => ({
            repoId: issue.repoId,
            threadNumber: issue.number,
            labelName,
          })),
        )
        .run();
    }
  }

  const mirroredAssignees = tx
    .select({ userId: mirrorThreadAssignee.userId })
    .from(mirrorThreadAssignee)
    .where(
      and(
        eq(mirrorThreadAssignee.repoId, issue.repoId),
        eq(mirrorThreadAssignee.threadNumber, issue.number),
      ),
    )
    .all()
    .map((row) => row.userId);
  if (!sameIdSet(mirroredAssignees, new Set(assigneeIds))) {
    tx.delete(mirrorThreadAssignee)
      .where(
        and(
          eq(mirrorThreadAssignee.repoId, issue.repoId),
          eq(mirrorThreadAssignee.threadNumber, issue.number),
        ),
      )
      .run();
    if (assigneeIds.length > 0) {
      tx.insert(mirrorThreadAssignee)
        .values(
          assigneeIds.map((userId) => ({
            repoId: issue.repoId,
            threadNumber: issue.number,
            userId,
          })),
        )
        .run();
    }
  }

  for (let i = 0; i < comments.length; i += COMMENT_WRITE_CHUNK) {
    tx.insert(mirrorComment)
      .values(
        comments.slice(i, i + COMMENT_WRITE_CHUNK).map((comment) => ({
          repoId: issue.repoId,
          threadNumber: issue.number,
          externalId: comment.externalId,
          authorId: comment.authorId,
          body: comment.body,
          reactions: comment.reactions,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [mirrorComment.repoId, mirrorComment.externalId],
        set: {
          threadNumber: sql`excluded.thread_number`,
          authorId: sql`excluded.author_id`,
          body: sql`excluded.body`,
          reactions: sql`excluded.reactions`,
          createdAt: sql`excluded.created_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .run();
  }

  // `issue.comments` is the complete upstream set: anything mirrored for this
  // thread but absent from it was deleted or hidden, so prune it. Deletes are
  // scoped to `(repoId, threadNumber)` and chunked below SQLite's 999
  // bound-variable limit.
  const incoming = new Set(comments.map((comment) => comment.externalId));
  const mirrored = tx
    .select({ externalId: mirrorComment.externalId })
    .from(mirrorComment)
    .where(
      and(
        eq(mirrorComment.repoId, issue.repoId),
        eq(mirrorComment.threadNumber, issue.number),
      ),
    )
    .all();
  const stale = mirrored
    .map((row) => row.externalId)
    .filter((externalId) => !incoming.has(externalId));
  const DELETE_CHUNK = 900;
  for (let i = 0; i < stale.length; i += DELETE_CHUNK) {
    tx.delete(mirrorComment)
      .where(
        and(
          eq(mirrorComment.repoId, issue.repoId),
          eq(mirrorComment.threadNumber, issue.number),
          inArray(mirrorComment.externalId, stale.slice(i, i + DELETE_CHUNK)),
        ),
      )
      .run();
  }

  // Keep the FTS row in the same transaction as the content it indexes.
  writeSearchRow(
    tx,
    issue.repoId,
    issue.number,
    issue.title,
    issue.body,
    comments.map((comment) => comment.body),
  );
}

/**
 * Upsert a batch of issues in one transaction. Users are FK targets, so they
 * are collapsed and upserted once up front, then every thread, label,
 * assignee and comment row reuses that id map. `metadata` is either shared by
 * the whole batch or resolved per issue.
 */
export function upsertIssues(
  issues: readonly IssueRecord[],
  metadata: StoredMetadata | ((issue: IssueRecord) => StoredMetadata),
  vocabulary: ReservedVocabulary = DEFAULT_VOCABULARY,
): void {
  if (issues.length === 0) return;
  const metadataFor =
    typeof metadata === "function" ? metadata : () => metadata;
  db.transaction((tx) => {
    // Users are FK targets, so one batched upsert lands them first; every
    // thread, label, assignee and comment row reuses the returned id map.
    const userIds = upsertUsersIn(tx, collectIssueUsers(issues));
    for (const issue of issues) {
      writeIssue(
        tx,
        prepareIssue(issue, metadataFor(issue), userIds),
        vocabulary,
      );
    }
  });
  bumpRevision();
}

/** One-record wrapper over {@link upsertIssues}. */
export function upsertIssue(
  issue: IssueRecord,
  metadata: StoredMetadata,
  vocabulary: ReservedVocabulary = DEFAULT_VOCABULARY,
): void {
  upsertIssues([issue], metadata, vocabulary);
}

/**
 * Whether the issue's mirrored label set carries the `epic` type label. Used
 * when a metadata-only write omits `isEpic` (older callers, such as conflict
 * resolution): the cache must follow the labels, not be cleared to 0.
 */
function carriedEpicLabel(
  repoId: number,
  number: number,
  vocabulary: ReservedVocabulary = DEFAULT_VOCABULARY,
): boolean {
  const epicName = (
    vocabulary.byBase.get("epic")?.name ?? "epic"
  ).toLowerCase();
  return db
    .select({ name: mirrorThreadLabel.labelName })
    .from(mirrorThreadLabel)
    .where(
      and(
        eq(mirrorThreadLabel.repoId, repoId),
        eq(mirrorThreadLabel.threadNumber, number),
      ),
    )
    .all()
    .some((row) => row.name.toLowerCase() === epicName);
}

export function setIssueMetadata(
  repoId: number,
  number: number,
  metadata: StoredMetadata,
  vocabulary: ReservedVocabulary = DEFAULT_VOCABULARY,
): void {
  db.update(mirrorThread)
    .set({
      status: metadata.status,
      impact: metadata.impact,
      urgency: metadata.urgency,
      priority: metadata.priority,
      priorityRank: storedPriorityRank(metadata.priority),
      size: metadata.size,
      blocked: metadata.blocked ? 1 : 0,
      isEpic: (metadata.isEpic ?? carriedEpicLabel(repoId, number, vocabulary))
        ? 1
        : 0,
      labelConflict: metadata.labelConflict ? 1 : 0,
    })
    .where(
      and(eq(mirrorThread.repoId, repoId), eq(mirrorThread.number, number)),
    )
    .run();
  bumpRevision();
}

export function replaceIssueLabels(
  repoId: number,
  number: number,
  labels: readonly string[],
): void {
  if (sameStringMultiset(getIssueLabels(repoId, number), labels)) return;
  db.transaction((tx) => {
    tx.delete(mirrorThreadLabel)
      .where(
        and(
          eq(mirrorThreadLabel.repoId, repoId),
          eq(mirrorThreadLabel.threadNumber, number),
        ),
      )
      .run();
    if (labels.length > 0) {
      tx.insert(mirrorThreadLabel)
        .values(
          labels.map((labelName) => ({
            repoId,
            threadNumber: number,
            labelName,
          })),
        )
        .run();
    }
  });
  bumpRevision();
}

export function getIssueLabels(repoId: number, number: number): string[] {
  return db
    .select({ name: mirrorThreadLabel.labelName })
    .from(mirrorThreadLabel)
    .where(
      and(
        eq(mirrorThreadLabel.repoId, repoId),
        eq(mirrorThreadLabel.threadNumber, number),
      ),
    )
    .all()
    .map((r) => r.name);
}

/** External ids of the people currently assigned to an issue. */
export function getIssueAssigneeIds(repoId: number, number: number): string[] {
  return db
    .select({ externalId: mirrorUser.externalId })
    .from(mirrorThreadAssignee)
    .innerJoin(
      mirrorUser,
      eq(mirrorThreadAssignee.userId, mirrorUser.id),
    )
    .where(
      and(
        eq(mirrorThreadAssignee.repoId, repoId),
        eq(mirrorThreadAssignee.threadNumber, number),
      ),
    )
    .all()
    .map((row) => row.externalId);
}

export interface IssueCommentRow {
  externalId: string;
  body: string;
  authorLogin?: string;
  authorAvatarUrl?: string;
}

/** Comments for an issue in chronological order, with their author identity. */
export function getIssueComments(
  repoId: number,
  number: number,
): IssueCommentRow[] {
  return db
    .select({
      externalId: mirrorComment.externalId,
      body: mirrorComment.body,
      authorLogin: mirrorUser.login,
      authorAvatarUrl: mirrorUser.avatarUrl,
    })
    .from(mirrorComment)
    .leftJoin(mirrorUser, eq(mirrorComment.authorId, mirrorUser.id))
    .where(
      and(
        eq(mirrorComment.repoId, repoId),
        eq(mirrorComment.threadNumber, number),
      ),
    )
    .orderBy(asc(mirrorComment.createdAt), asc(mirrorComment.externalId))
    .all()
    .map((row) => ({
      externalId: row.externalId,
      body: row.body,
      ...(row.authorLogin !== null
        ? {
            authorLogin: row.authorLogin,
            authorAvatarUrl: row.authorAvatarUrl ?? "",
          }
        : {}),
    }));
}

export function getIssue(
  repoId: number,
  number: number,
): typeof mirrorThread.$inferSelect | undefined {
  return db
    .select()
    .from(mirrorThread)
    .where(and(eq(mirrorThread.repoId, repoId), eq(mirrorThread.number, number)))
    .get();
}

// ---------------------------------------------------------------------------
// Linked pull requests (issue #28)
// ---------------------------------------------------------------------------

export type PullRequestRow = typeof mirrorPullRequest.$inferSelect;

function collectPullRequestUsers(
  pullRequests: readonly PullRequestRecord[],
): UserRecord[] {
  const users = new Map<string, UserRecord>();
  for (const pr of pullRequests) {
    if (pr.author) users.set(userKey(pr.author), pr.author);
  }
  return [...users.values()];
}

/**
 * Upsert a batch of linked pull requests. Authors are FK targets, so they land
 * first in the same transaction; the check/review columns are replaced whole so
 * a merged or newly failing PR converges in one write.
 */
export function upsertPullRequests(
  pullRequests: readonly PullRequestRecord[],
): void {
  if (pullRequests.length === 0) return;
  db.transaction((tx) => {
    const userIds = upsertUsersIn(tx, collectPullRequestUsers(pullRequests));
    for (const pr of pullRequests) {
      const values = {
        repoId: pr.repoId,
        number: pr.number,
        externalId: pr.externalId,
        title: pr.title,
        state: pr.state,
        isDraft: pr.isDraft ? 1 : 0,
        merged: pr.merged ? 1 : 0,
        reviewDecision: pr.reviewDecision,
        approvedCount: pr.approvedCount,
        changesRequestedCount: pr.changesRequestedCount,
        pendingReviewCount: pr.pendingReviewCount,
        checksState: pr.checks?.state ?? null,
        checksTotal: pr.checks?.total ?? null,
        checksFailed: pr.checks?.failed ?? null,
        checksUrl: pr.checks?.url ?? null,
        url: pr.url,
        authorId: pr.author ? requireUserId(userIds, pr.author) : null,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        closedAt: pr.closedAt,
        mergedAt: pr.mergedAt,
      };
      tx.insert(mirrorPullRequest)
        .values(values)
        .onConflictDoUpdate({
          target: [mirrorPullRequest.repoId, mirrorPullRequest.number],
          set: {
            externalId: values.externalId,
            title: values.title,
            state: values.state,
            isDraft: values.isDraft,
            merged: values.merged,
            reviewDecision: values.reviewDecision,
            approvedCount: values.approvedCount,
            changesRequestedCount: values.changesRequestedCount,
            pendingReviewCount: values.pendingReviewCount,
            checksState: values.checksState,
            checksTotal: values.checksTotal,
            checksFailed: values.checksFailed,
            checksUrl: values.checksUrl,
            url: values.url,
            authorId: values.authorId,
            createdAt: values.createdAt,
            updatedAt: values.updatedAt,
            closedAt: values.closedAt,
            mergedAt: values.mergedAt,
          },
        })
        .run();
    }
  });
  bumpRevision();
}

function linkKey(link: { prNumber: number; source: string }): string {
  return `${link.prNumber}\u0000${link.source}`;
}

/**
 * Replace every link for one issue with the discovered set. A no-op when the
 * set is unchanged keeps hot polls from bumping the mirror revision.
 */
export function replaceIssuePullRequestLinks(
  repoId: number,
  issueNumber: number,
  links: readonly Pick<IssuePullRequestLink, "prNumber" | "source">[],
): void {
  const existing = db
    .select({
      prNumber: mirrorIssuePullRequest.prNumber,
      source: mirrorIssuePullRequest.source,
    })
    .from(mirrorIssuePullRequest)
    .where(
      and(
        eq(mirrorIssuePullRequest.repoId, repoId),
        eq(mirrorIssuePullRequest.issueNumber, issueNumber),
      ),
    )
    .all();
  const before = new Set(existing.map(linkKey));
  const after = new Set(links.map(linkKey));
  if (
    before.size === after.size &&
    [...after].every((key) => before.has(key))
  ) {
    return;
  }

  db.transaction((tx) => {
    tx.delete(mirrorIssuePullRequest)
      .where(
        and(
          eq(mirrorIssuePullRequest.repoId, repoId),
          eq(mirrorIssuePullRequest.issueNumber, issueNumber),
        ),
      )
      .run();
    if (links.length > 0) {
      tx.insert(mirrorIssuePullRequest)
        .values(
          links.map((link) => ({
            repoId,
            issueNumber,
            prNumber: link.prNumber,
            source: link.source,
          })),
        )
        .run();
    }
  });
  bumpRevision();
}

export interface IssuePullRequestRow {
  number: number;
  title: string;
  state: string;
  isDraft: number;
  merged: number;
  reviewDecision: string | null;
  approvedCount: number;
  changesRequestedCount: number;
  pendingReviewCount: number;
  checksState: string | null;
  checksTotal: number | null;
  checksFailed: number | null;
  checksUrl: string | null;
  url: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  mergedAt: number | null;
  authorExternalId: string | null;
  authorForge: string | null;
  authorInstance: string | null;
  authorLogin: string | null;
  authorAvatar: string | null;
}

/** Every linked pull request for one issue, newest activity first. */
export function getIssuePullRequests(
  repoId: number,
  issueNumber: number,
): IssuePullRequestRow[] {
  return db
    .select({
      number: mirrorPullRequest.number,
      title: mirrorPullRequest.title,
      state: mirrorPullRequest.state,
      isDraft: mirrorPullRequest.isDraft,
      merged: mirrorPullRequest.merged,
      reviewDecision: mirrorPullRequest.reviewDecision,
      approvedCount: mirrorPullRequest.approvedCount,
      changesRequestedCount: mirrorPullRequest.changesRequestedCount,
      pendingReviewCount: mirrorPullRequest.pendingReviewCount,
      checksState: mirrorPullRequest.checksState,
      checksTotal: mirrorPullRequest.checksTotal,
      checksFailed: mirrorPullRequest.checksFailed,
      checksUrl: mirrorPullRequest.checksUrl,
      url: mirrorPullRequest.url,
      source: mirrorIssuePullRequest.source,
      createdAt: mirrorPullRequest.createdAt,
      updatedAt: mirrorPullRequest.updatedAt,
      closedAt: mirrorPullRequest.closedAt,
      mergedAt: mirrorPullRequest.mergedAt,
      authorExternalId: mirrorUser.externalId,
      authorForge: mirrorUser.forge,
      authorInstance: mirrorUser.instance,
      authorLogin: mirrorUser.login,
      authorAvatar: mirrorUser.avatarUrl,
    })
    .from(mirrorIssuePullRequest)
    .innerJoin(
      mirrorPullRequest,
      and(
        eq(mirrorPullRequest.repoId, mirrorIssuePullRequest.repoId),
        eq(mirrorPullRequest.number, mirrorIssuePullRequest.prNumber),
      ),
    )
    .leftJoin(mirrorUser, eq(mirrorPullRequest.authorId, mirrorUser.id))
    .where(
      and(
        eq(mirrorIssuePullRequest.repoId, repoId),
        eq(mirrorIssuePullRequest.issueNumber, issueNumber),
      ),
    )
    .orderBy(asc(mirrorPullRequest.number))
    .all();
}

/** Every mirrored pull request for a repo (batched refresh input). */
export function listPullRequests(repoId: number): PullRequestRow[] {
  return db
    .select()
    .from(mirrorPullRequest)
    .where(eq(mirrorPullRequest.repoId, repoId))
    .orderBy(asc(mirrorPullRequest.number))
    .all();
}

/** Issue numbers that currently have at least one linked pull request. */
export function linkedIssueNumbers(repoId: number): number[] {
  return db
    .selectDistinct({ number: mirrorIssuePullRequest.issueNumber })
    .from(mirrorIssuePullRequest)
    .where(eq(mirrorIssuePullRequest.repoId, repoId))
    .all()
    .map((row) => row.number);
}

/** Drop pull requests that no linked issue references after a link refresh. */
export function pruneOrphanPullRequests(repoId: number): number {
  const keep = db
    .select({ number: mirrorIssuePullRequest.prNumber })
    .from(mirrorIssuePullRequest)
    .where(eq(mirrorIssuePullRequest.repoId, repoId))
    .all()
    .map((row) => row.number);
  const removed = keep.length
    ? db
        .delete(mirrorPullRequest)
        .where(
          and(
            eq(mirrorPullRequest.repoId, repoId),
            notInArray(mirrorPullRequest.number, keep),
          ),
        )
        .run()
    : db
        .delete(mirrorPullRequest)
        .where(eq(mirrorPullRequest.repoId, repoId))
        .run();
  if ((removed.changes ?? 0) > 0) bumpRevision();
  return removed.changes ?? 0;
}

/** Update the cached status after an automatic label write. */
export function setIssueStatus(
  repoId: number,
  number: number,
  status: string,
): void {
  db.update(mirrorThread)
    .set({ status })
    .where(
      and(eq(mirrorThread.repoId, repoId), eq(mirrorThread.number, number)),
    )
    .run();
  bumpRevision();
}

/** Update the cached state after an automatic close. */
export function markIssueClosed(
  repoId: number,
  number: number,
  closedAt: number,
): void {
  db.update(mirrorThread)
    .set({ state: "closed", stateReason: "completed", closedAt })
    .where(
      and(eq(mirrorThread.repoId, repoId), eq(mirrorThread.number, number)),
    )
    .run();
  bumpRevision();
}

/** Delete a thread and its child rows (no FK cascade on the junctions). */
export function deleteIssue(repoId: number, number: number): void {
  db.transaction((tx) => {
    tx.run(
      sql`DELETE FROM mirror_thread_fts WHERE repo_id = ${repoId} AND number = ${number}`,
    );
    tx.delete(mirrorIssuePullRequest)
      .where(
        and(
          eq(mirrorIssuePullRequest.repoId, repoId),
          eq(mirrorIssuePullRequest.issueNumber, number),
        ),
      )
      .run();
    tx.delete(mirrorThreadLabel)
      .where(
        and(
          eq(mirrorThreadLabel.repoId, repoId),
          eq(mirrorThreadLabel.threadNumber, number),
        ),
      )
      .run();
    tx.delete(mirrorThreadAssignee)
      .where(
        and(
          eq(mirrorThreadAssignee.repoId, repoId),
          eq(mirrorThreadAssignee.threadNumber, number),
        ),
      )
      .run();
    tx.delete(mirrorComment)
      .where(
        and(
          eq(mirrorComment.repoId, repoId),
          eq(mirrorComment.threadNumber, number),
        ),
      )
      .run();
    tx.delete(mirrorThread)
      .where(
        and(eq(mirrorThread.repoId, repoId), eq(mirrorThread.number, number)),
      )
      .run();
  });
  bumpRevision();
}

/** Prune every mirrored issue for a repo that is absent from `numbers`. */
export function deleteIssuesNotIn(
  repoId: number,
  numbers: readonly number[],
): number {
  const keep = new Set(numbers);
  const existing = db
    .select({ number: mirrorThread.number })
    .from(mirrorThread)
    .where(eq(mirrorThread.repoId, repoId))
    .all();
  let removed = 0;
  for (const row of existing) {
    if (!keep.has(row.number)) {
      deleteIssue(repoId, row.number);
      removed += 1;
    }
  }
  return removed;
}
