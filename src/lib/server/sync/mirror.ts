/**
 * Drizzle read/write helpers for the disposable `mirror_github_*` cache
 * (SPEC §7.1). Everything here is rebuildable from GitHub: the sync worker
 * upserts hydrated records, the conflict resolver rewrites label assignments,
 * and reconciliation prunes rows that no longer exist upstream.
 *
 * The junction tables (`mirror_github_issue_label`, `mirror_github_issue_assignee`)
 * and `mirror_github_comment` carry no FK to the issue row (see `db/schema.ts`),
 * so deletes remove children explicitly before the parent.
 *
 * The per-repo polling cursor is *derived*, not stored: it is the newest
 * `updated_at` mirrored for the repo (SPEC §7.2). GitHub's `since` is
 * inclusive, so re-sending that boundary issue is an idempotent upsert.
 */
import { and, eq, max } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  mirrorGithubComment,
  mirrorGithubIssue,
  mirrorGithubIssueAssignee,
  mirrorGithubIssueLabel,
  mirrorGithubRepo,
  mirrorGithubRepoLabel,
  mirrorGithubUser,
} from "#lib/server/db/schema";

export interface RepoRow {
  githubId: number;
  org: string;
  name: string;
  etag: string | null;
  archived: number;
  degraded: number;
  lastPolledAt: number | null;
  lastReconciledAt: number | null;
}

export interface UserRecord {
  githubId: number;
  login: string;
  avatarUrl: string;
}

export interface CommentRecord {
  githubId: number;
  author: UserRecord | null;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface IssueRecord {
  githubId: number;
  repoId: number;
  number: number;
  title: string;
  body: string;
  state: string;
  stateReason: string | null;
  author: UserRecord | null;
  milestoneName: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  labels: string[];
  assignees: UserRecord[];
  comments: CommentRecord[];
}

/** Cached reserved-label derivation stored on the issue row (SPEC §5.2). */
export interface StoredMetadata {
  status: string | null;
  priority: string | null;
  size: string | null;
  labelConflict: boolean;
}

// ---------------------------------------------------------------------------
// Repos
// ---------------------------------------------------------------------------

export function upsertRepo(input: {
  githubId: number;
  org: string;
  name: string;
  archived: boolean;
}): RepoRow {
  const archived = input.archived ? 1 : 0;
  db.insert(mirrorGithubRepo)
    .values({
      githubId: input.githubId,
      org: input.org,
      name: input.name,
      archived,
    })
    .onConflictDoUpdate({
      target: mirrorGithubRepo.githubId,
      set: { org: input.org, name: input.name, archived },
    })
    .run();
  const row = getRepo(input.githubId);
  if (!row) throw new Error(`repo ${input.githubId} missing after upsert`);
  return row;
}

export function getRepo(githubId: number): RepoRow | undefined {
  return db
    .select()
    .from(mirrorGithubRepo)
    .where(eq(mirrorGithubRepo.githubId, githubId))
    .get();
}

export function getRepoByOrgName(org: string, name: string): RepoRow | undefined {
  return db
    .select()
    .from(mirrorGithubRepo)
    .where(and(eq(mirrorGithubRepo.org, org), eq(mirrorGithubRepo.name, name)))
    .get();
}

export function listRepos(): RepoRow[] {
  return db.select().from(mirrorGithubRepo).all();
}

export function setRepoEtag(githubId: number, etag: string | null): void {
  db.update(mirrorGithubRepo)
    .set({ etag })
    .where(eq(mirrorGithubRepo.githubId, githubId))
    .run();
}

export function setRepoPolledAt(githubId: number, at: number): void {
  db.update(mirrorGithubRepo)
    .set({ lastPolledAt: at })
    .where(eq(mirrorGithubRepo.githubId, githubId))
    .run();
}

export function setRepoReconciledAt(githubId: number, at: number): void {
  db.update(mirrorGithubRepo)
    .set({ lastReconciledAt: at })
    .where(eq(mirrorGithubRepo.githubId, githubId))
    .run();
}

export function setRepoDegraded(githubId: number, degraded: boolean): void {
  db.update(mirrorGithubRepo)
    .set({ degraded: degraded ? 1 : 0 })
    .where(eq(mirrorGithubRepo.githubId, githubId))
    .run();
}

/** Newest `updated_at` mirrored for a repo; `null` before the first backfill. */
export function getRepoCursor(repoId: number): number | null {
  const row = db
    .select({ value: max(mirrorGithubIssue.updatedAt) })
    .from(mirrorGithubIssue)
    .where(eq(mirrorGithubIssue.repoId, repoId))
    .get();
  return row?.value ?? null;
}

// ---------------------------------------------------------------------------
// Users & repo labels
// ---------------------------------------------------------------------------

export function upsertUser(user: UserRecord): void {
  db.insert(mirrorGithubUser)
    .values(user)
    .onConflictDoUpdate({
      target: mirrorGithubUser.githubId,
      set: { login: user.login, avatarUrl: user.avatarUrl },
    })
    .run();
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
    tx.delete(mirrorGithubRepoLabel)
      .where(eq(mirrorGithubRepoLabel.repoId, repoId))
      .run();
    if (labels.length > 0) {
      tx.insert(mirrorGithubRepoLabel)
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
      name: mirrorGithubRepoLabel.name,
      color: mirrorGithubRepoLabel.color,
      description: mirrorGithubRepoLabel.description,
    })
    .from(mirrorGithubRepoLabel)
    .where(eq(mirrorGithubRepoLabel.repoId, repoId))
    .all();
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

function upsertUsers(issue: IssueRecord): void {
  if (issue.author) upsertUser(issue.author);
  for (const a of issue.assignees) upsertUser(a);
  for (const c of issue.comments) if (c.author) upsertUser(c.author);
}

export function upsertIssue(issue: IssueRecord, metadata: StoredMetadata): void {
  // Users are FK targets for author/assignee/comment rows, so they land first.
  upsertUsers(issue);

  db.transaction((tx) => {
    tx.insert(mirrorGithubIssue)
      .values({
        repoId: issue.repoId,
        number: issue.number,
        githubId: issue.githubId,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        stateReason: issue.stateReason,
        authorId: issue.author?.githubId ?? null,
        milestoneName: issue.milestoneName,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        closedAt: issue.closedAt,
        status: metadata.status,
        priority: metadata.priority,
        size: metadata.size,
        labelConflict: metadata.labelConflict ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [mirrorGithubIssue.repoId, mirrorGithubIssue.number],
        set: {
          githubId: issue.githubId,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          stateReason: issue.stateReason,
          authorId: issue.author?.githubId ?? null,
          milestoneName: issue.milestoneName,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          closedAt: issue.closedAt,
          status: metadata.status,
          priority: metadata.priority,
          size: metadata.size,
          labelConflict: metadata.labelConflict ? 1 : 0,
        },
      })
      .run();

    tx.delete(mirrorGithubIssueLabel)
      .where(
        and(
          eq(mirrorGithubIssueLabel.repoId, issue.repoId),
          eq(mirrorGithubIssueLabel.issueNumber, issue.number),
        ),
      )
      .run();
    if (issue.labels.length > 0) {
      tx.insert(mirrorGithubIssueLabel)
        .values(
          issue.labels.map((labelName) => ({
            repoId: issue.repoId,
            issueNumber: issue.number,
            labelName,
          })),
        )
        .run();
    }

    tx.delete(mirrorGithubIssueAssignee)
      .where(
        and(
          eq(mirrorGithubIssueAssignee.repoId, issue.repoId),
          eq(mirrorGithubIssueAssignee.issueNumber, issue.number),
        ),
      )
      .run();
    if (issue.assignees.length > 0) {
      tx.insert(mirrorGithubIssueAssignee)
        .values(
          issue.assignees.map((a) => ({
            repoId: issue.repoId,
            issueNumber: issue.number,
            userId: a.githubId,
          })),
        )
        .run();
    }

    for (const c of issue.comments) {
      tx.insert(mirrorGithubComment)
        .values({
          githubId: c.githubId,
          repoId: issue.repoId,
          issueNumber: issue.number,
          authorId: c.author?.githubId ?? null,
          body: c.body,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })
        .onConflictDoUpdate({
          target: mirrorGithubComment.githubId,
          set: {
            authorId: c.author?.githubId ?? null,
            body: c.body,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
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
  db.update(mirrorGithubIssue)
    .set({
      status: metadata.status,
      priority: metadata.priority,
      size: metadata.size,
      labelConflict: metadata.labelConflict ? 1 : 0,
    })
    .where(
      and(
        eq(mirrorGithubIssue.repoId, repoId),
        eq(mirrorGithubIssue.number, number),
      ),
    )
    .run();
}

export function replaceIssueLabels(
  repoId: number,
  number: number,
  labels: readonly string[],
): void {
  db.transaction((tx) => {
    tx.delete(mirrorGithubIssueLabel)
      .where(
        and(
          eq(mirrorGithubIssueLabel.repoId, repoId),
          eq(mirrorGithubIssueLabel.issueNumber, number),
        ),
      )
      .run();
    if (labels.length > 0) {
      tx.insert(mirrorGithubIssueLabel)
        .values(
          labels.map((labelName) => ({ repoId, issueNumber: number, labelName })),
        )
        .run();
    }
  });
}

export function getIssueLabels(repoId: number, number: number): string[] {
  return db
    .select({ name: mirrorGithubIssueLabel.labelName })
    .from(mirrorGithubIssueLabel)
    .where(
      and(
        eq(mirrorGithubIssueLabel.repoId, repoId),
        eq(mirrorGithubIssueLabel.issueNumber, number),
      ),
    )
    .all()
    .map((r) => r.name);
}

export function getIssue(
  repoId: number,
  number: number,
): typeof mirrorGithubIssue.$inferSelect | undefined {
  return db
    .select()
    .from(mirrorGithubIssue)
    .where(
      and(
        eq(mirrorGithubIssue.repoId, repoId),
        eq(mirrorGithubIssue.number, number),
      ),
    )
    .get();
}

/** Delete an issue and its child rows (no FK cascade on the junctions). */
export function deleteIssue(repoId: number, number: number): void {
  db.transaction((tx) => {
    tx.delete(mirrorGithubIssueLabel)
      .where(
        and(
          eq(mirrorGithubIssueLabel.repoId, repoId),
          eq(mirrorGithubIssueLabel.issueNumber, number),
        ),
      )
      .run();
    tx.delete(mirrorGithubIssueAssignee)
      .where(
        and(
          eq(mirrorGithubIssueAssignee.repoId, repoId),
          eq(mirrorGithubIssueAssignee.issueNumber, number),
        ),
      )
      .run();
    tx.delete(mirrorGithubComment)
      .where(
        and(
          eq(mirrorGithubComment.repoId, repoId),
          eq(mirrorGithubComment.issueNumber, number),
        ),
      )
      .run();
    tx.delete(mirrorGithubIssue)
      .where(
        and(
          eq(mirrorGithubIssue.repoId, repoId),
          eq(mirrorGithubIssue.number, number),
        ),
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
    .select({ number: mirrorGithubIssue.number })
    .from(mirrorGithubIssue)
    .where(eq(mirrorGithubIssue.repoId, repoId))
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
