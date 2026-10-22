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
import { and, asc, eq, max } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  mirrorComment,
  mirrorMilestone,
  mirrorRepo,
  mirrorRepoAssignee,
  mirrorRepoLabel,
  mirrorThread,
  mirrorThreadAssignee,
  mirrorThreadLabel,
  mirrorUser,
} from "#lib/server/db/schema";
import {
  retiredPriorityConflict,
  type Impact,
  type Priority,
  type Urgency,
} from "#lib/priority";

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
  labelConflict: boolean;
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
 * Upsert a person on `(forge, instance, external_id)` and return the internal
 * row. The input `id` is ignored: only SQLite assigns internal ids.
 */
export function upsertUser(user: UserRecord): UserRecord {
  db.insert(mirrorUser)
    .values({
      forge: user.forge,
      instance: user.instance,
      externalId: user.externalId,
      login: user.login,
      avatarUrl: user.avatarUrl,
      url: user.url,
    })
    .onConflictDoUpdate({
      target: [mirrorUser.forge, mirrorUser.instance, mirrorUser.externalId],
      set: {
        login: user.login,
        avatarUrl: user.avatarUrl,
        url: user.url,
      },
    })
    .run();
  const row = getUser(user.externalId, user.forge, user.instance);
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

export interface RepoLabelRecord {
  name: string;
  color: string;
  description: string;
}

/** Replace a repo's full label set (filter options come from here). */
export function replaceRepoLabels(
  repoId: number,
  labels: readonly RepoLabelRecord[],
): void {
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
  const ids = new Map<string, number>();
  for (const user of users) ids.set(userKey(user), upsertUser(user).id);
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

/**
 * Replace a repo's full milestone set (SPEC §7.1). Milestones are repo-scoped,
 * so the list is swapped wholesale on each poll; the creator is upserted first
 * because it is an FK target.
 */
export function replaceRepoMilestones(
  repoId: number,
  milestones: readonly MilestoneRecord[],
): void {
  const creators = milestones.map((milestone) =>
    milestone.creator ? upsertUser(milestone.creator).id : null,
  );
  db.transaction((tx) => {
    tx.delete(mirrorMilestone)
      .where(eq(mirrorMilestone.repoId, repoId))
      .run();
    if (milestones.length > 0) {
      tx.insert(mirrorMilestone)
        .values(
          milestones.map((m, index) => ({
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
          })),
        )
        .run();
    }
  });
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

export function upsertIssue(issue: IssueRecord, metadata: StoredMetadata): void {
  // Users are FK targets for author/assignee/comment rows, so they land first
  // and their internal ids are what the thread rows point at.
  const authorId = issue.author ? upsertUser(issue.author).id : null;
  const assigneeIds = new Map<string, number>();
  for (const assignee of issue.assignees) {
    assigneeIds.set(userKey(assignee), upsertUser(assignee).id);
  }
  const comments = issue.comments.map((comment) => ({
    externalId: comment.externalId,
    authorId: comment.author ? upsertUser(comment.author).id : null,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }));

  // A matching retired p-label is just stale; a mismatching one is a conflict
  // the UI should surface, exactly like an ambiguous reserved-label timeline.
  const labelConflict =
    metadata.labelConflict ||
    retiredPriorityConflict(metadata.priority, issue.labels);

  db.transaction((tx) => {
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
        size: metadata.size,
        blocked: metadata.blocked ? 1 : 0,
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
          size: metadata.size,
          blocked: metadata.blocked ? 1 : 0,
          labelConflict: labelConflict ? 1 : 0,
        },
      })
      .run();

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

    tx.delete(mirrorThreadAssignee)
      .where(
        and(
          eq(mirrorThreadAssignee.repoId, issue.repoId),
          eq(mirrorThreadAssignee.threadNumber, issue.number),
        ),
      )
      .run();
    if (assigneeIds.size > 0) {
      tx.insert(mirrorThreadAssignee)
        .values(
          [...assigneeIds.values()].map((userId) => ({
            repoId: issue.repoId,
            threadNumber: issue.number,
            userId,
          })),
        )
        .run();
    }

    for (const comment of comments) {
      tx.insert(mirrorComment)
        .values({
          repoId: issue.repoId,
          threadNumber: issue.number,
          externalId: comment.externalId,
          authorId: comment.authorId,
          body: comment.body,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        })
        .onConflictDoUpdate({
          target: [mirrorComment.repoId, mirrorComment.externalId],
          set: {
            threadNumber: issue.number,
            authorId: comment.authorId,
            body: comment.body,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
          },
        })
        .run();
    }
  });
}

export function setIssueMetadata(
  repoId: number,
  number: number,
  metadata: StoredMetadata,
): void {
  db.update(mirrorThread)
    .set({
      status: metadata.status,
      impact: metadata.impact,
      urgency: metadata.urgency,
      priority: metadata.priority,
      size: metadata.size,
      blocked: metadata.blocked ? 1 : 0,
      labelConflict: metadata.labelConflict ? 1 : 0,
    })
    .where(
      and(eq(mirrorThread.repoId, repoId), eq(mirrorThread.number, number)),
    )
    .run();
}

export function replaceIssueLabels(
  repoId: number,
  number: number,
  labels: readonly string[],
): void {
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

/** Delete a thread and its child rows (no FK cascade on the junctions). */
export function deleteIssue(repoId: number, number: number): void {
  db.transaction((tx) => {
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
