/**
 * Local GitHub emulation for demo mode (task T3).
 *
 * `demoProvider()` returns an object shaped like the subset of
 * `GitHubProvider` Funnel uses for issue writes. Every read and write goes
 * through the disposable `mirror_*` tables, so the cockpit's normal code paths
 * — issue updates, labels, comments, milestone creation and the `/api/repos`
 * passthrough — keep working without a network or GitHub App credentials.
 *
 * The provider advertises `DEMO_INSTANCE` and `DEMO_FORGE`; `urlFor()` still
 * builds an outbound `github.com` link so successful writes can be opened
 * upstream. Nothing here calls `fetch`.
 */
import { and, eq } from "drizzle-orm";
import type {
  Actor,
  CloseOptions,
  Comment,
  CommentRef,
  Label,
  Milestone,
  Repo,
  RepoRef,
  Thread,
  ThreadInput,
  ThreadKind,
  ThreadRef,
  ThreadUpdate,
} from "forges";
import type { GitHubProvider } from "forges/github";
import { db } from "#lib/server/db/index";
import {
  mirrorComment,
  mirrorMilestone,
  mirrorThread,
  mirrorThreadAssignee,
  mirrorUser,
} from "#lib/server/db/schema";
import {
  emptyReactions,
  type CommentReactions,
  type ReactionContent,
} from "#lib/reactions";
import { deriveMetadata } from "#lib/server/sync/conflicts";
import {
  getIssue,
  getIssueComments,
  getIssueLabels,
  getRepoBySlug,
  getRepoLabels,
  getRepoMilestones,
  refreshIssueSearchIndex,
  replaceIssueLabels,
  setIssueMetadata,
  upsertIssue,
  upsertUser,
  type IssueRecord,
  type MilestoneRecord,
  type RepoRow,
  type StoredMetadata,
  type UserRecord,
} from "#lib/server/sync/mirror";
import { bumpRevision } from "#lib/server/sync/revision";
import {
  DEMO_FORGE,
  DEMO_INSTANCE,
  DEMO_USER_EXTERNAL_ID,
  DEMO_USER_LOGIN,
} from "./profile";

/** The subset of REST query parameters the demo provider understands. */
type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
}

interface RestResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

interface RestMilestoneBody {
  title?: unknown;
  description?: unknown;
  due_on?: unknown;
}

/** The demo forges are always GitHub on `github.com`. */
const FORGE = DEMO_FORGE as GitHubProvider["forge"];

/** A not-found error carrying the `status` the passthrough and outcome map read. */
function notFound(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 404 });
}

function avatarUrl(externalId: string): string {
  return `https://avatars.githubusercontent.com/u/${externalId}?v=4`;
}

function issueUrl(repo: RepoRow, number: number): string {
  return `https://${DEMO_INSTANCE}/${repo.org}/${repo.name}/issues/${number}`;
}

function milestoneUrl(repo: RepoRow, number: number): string {
  return `https://${DEMO_INSTANCE}/${repo.org}/${repo.name}/milestone/${number}`;
}

function findRepo(owner: string, name: string): RepoRow {
  const repo = getRepoBySlug(DEMO_FORGE, DEMO_INSTANCE, owner, name);
  if (!repo) throw notFound(`Repository ${owner}/${name} not found`);
  return repo;
}

function toRepoRef(repo: RepoRow): RepoRef {
  return {
    forge: FORGE,
    instance: DEMO_INSTANCE,
    owner: repo.org,
    name: repo.name,
    externalId: repo.externalId,
  };
}

function threadKind(kind: string): ThreadKind {
  return kind === "pull_request" || kind === "discussion" ? kind : "issue";
}

function toThreadRef(repo: RepoRow, number: number): ThreadRef {
  return {
    forge: FORGE,
    instance: DEMO_INSTANCE,
    repo: toRepoRef(repo),
    kind: threadKind("issue"),
    number: String(number),
  };
}

function requireIssue(
  ref: ThreadRef,
): { repo: RepoRow; number: number; row: typeof mirrorThread.$inferSelect } {
  const repo = findRepo(ref.repo.owner, ref.repo.name);
  const number = Number(ref.number);
  if (!Number.isInteger(number) || number <= 0) {
    throw notFound(`Issue ${repo.org}/${repo.name}#${String(ref.number)} not found`);
  }
  const row = getIssue(repo.id, number);
  if (!row) {
    throw notFound(`Issue ${repo.org}/${repo.name}#${number} not found`);
  }
  return { repo, number, row };
}

function userById(id: number | null): UserRecord | undefined {
  if (id === null) return undefined;
  return db.select().from(mirrorUser).where(eq(mirrorUser.id, id)).get();
}

function findUserByLogin(login: string): UserRecord | undefined {
  return db
    .select()
    .from(mirrorUser)
    .where(
      and(
        eq(mirrorUser.forge, DEMO_FORGE),
        eq(mirrorUser.instance, DEMO_INSTANCE),
      ),
    )
    .all()
    .find((row) => row.login.toLowerCase() === login.toLowerCase());
}

function findUserByExternalId(externalId: string): UserRecord | undefined {
  return db
    .select()
    .from(mirrorUser)
    .where(
      and(
        eq(mirrorUser.forge, DEMO_FORGE),
        eq(mirrorUser.instance, DEMO_INSTANCE),
        eq(mirrorUser.externalId, externalId),
      ),
    )
    .get();
}

/** The seeded demo account as a mirrored person, created on first write. */
function demoUser(): UserRecord {
  const existing =
    findUserByExternalId(DEMO_USER_EXTERNAL_ID) ??
    findUserByLogin(DEMO_USER_LOGIN);
  if (existing) return existing;
  return upsertUser({
    id: 0,
    externalId: DEMO_USER_EXTERNAL_ID,
    forge: DEMO_FORGE,
    instance: DEMO_INSTANCE,
    login: DEMO_USER_LOGIN,
    avatarUrl: avatarUrl(DEMO_USER_EXTERNAL_ID),
    url: `https://${DEMO_INSTANCE}/${DEMO_USER_LOGIN}`,
  });
}

/** Resolve a write's assignee (login or actor) to a mirrored person. */
function ensureUser(input: string | Actor): UserRecord {
  if (typeof input !== "string") {
    const existing =
      (input.id ? findUserByExternalId(input.id) : undefined) ??
      findUserByLogin(input.login);
    if (existing) return existing;
    return upsertUser({
      id: 0,
      externalId: input.id || input.login,
      forge: DEMO_FORGE,
      instance: DEMO_INSTANCE,
      login: input.login,
      avatarUrl: input.avatarUrl ?? avatarUrl(input.id || input.login),
      url: input.url ?? `https://${DEMO_INSTANCE}/${input.login}`,
    });
  }
  const existing = findUserByLogin(input);
  if (existing) return existing;
  return upsertUser({
    id: 0,
    externalId: input,
    forge: DEMO_FORGE,
    instance: DEMO_INSTANCE,
    login: input,
    avatarUrl: avatarUrl(input),
    url: `https://${DEMO_INSTANCE}/${input}`,
  });
}

function toActor(user: UserRecord): Actor {
  return {
    forge: FORGE,
    instance: DEMO_INSTANCE,
    login: user.login,
    id: user.externalId,
    avatarUrl: user.avatarUrl || undefined,
    url: user.url || undefined,
    isBotHint: false,
  };
}

function threadAssignees(repoId: number, number: number): UserRecord[] {
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
    .from(mirrorThreadAssignee)
    .innerJoin(mirrorUser, eq(mirrorThreadAssignee.userId, mirrorUser.id))
    .where(
      and(
        eq(mirrorThreadAssignee.repoId, repoId),
        eq(mirrorThreadAssignee.threadNumber, number),
      ),
    )
    .all();
}

function repoLabelColours(repoId: number): Map<string, string> {
  return new Map(
    getRepoLabels(repoId).map((label) => [label.name, label.color]),
  );
}

function toLabels(repo: RepoRow, names: readonly string[]): Label[] {
  const colours = repoLabelColours(repo.id);
  return names.map((name) => ({
    name,
    ...(colours.get(name) ? { colour: colours.get(name) } : {}),
  }));
}

function toMilestone(record: MilestoneRecord): Milestone {
  return {
    id: record.externalId || String(record.number),
    title: record.title,
    state: record.state === "closed" ? "closed" : "open",
    description: record.description,
    ...(record.dueOn !== null ? { dueOn: new Date(record.dueOn) } : {}),
    url: record.url,
    raw: record,
  };
}

function toThread(
  repo: RepoRow,
  row: typeof mirrorThread.$inferSelect,
): Thread {
  const labels = getIssueLabels(repo.id, row.number);
  const milestone =
    row.milestoneNumber === null
      ? undefined
      : getRepoMilestones(repo.id).find(
          (entry) => entry.number === row.milestoneNumber,
        );

  return {
    ref: {
      ...toThreadRef(repo, row.number),
      number: String(row.number),
    },
    kind: threadKind(row.kind),
    title: row.title,
    body: row.body,
    state:
      row.state === "closed"
        ? "closed"
        : row.state === "open"
          ? "open"
          : "unknown",
    stateRaw: row.state,
    ...(row.stateReason ? { stateReason: row.stateReason } : {}),
    isDraft: false,
    ...(row.authorId !== null && userById(row.authorId)
      ? { author: toActor(userById(row.authorId)!) }
      : {}),
    assignees: threadAssignees(repo.id, row.number).map(toActor),
    reviewers: [],
    labels: toLabels(repo, labels),
    url: row.url || issueUrl(repo, row.number),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    ...(row.closedAt !== null
      ? { closedAt: new Date(row.closedAt) }
      : {}),
    ...(milestone ? { milestone: toMilestone(milestone) } : {}),
    raw: row,
  };
}

function metadataFor(labels: readonly string[]): StoredMetadata {
  const derived = deriveMetadata(labels);
  return {
    status: derived.status,
    impact: derived.impact,
    urgency: derived.urgency,
    priority: derived.priority,
    size: derived.size,
    blocked: derived.blocked,
    isEpic: derived.isEpic,
    labelConflict: derived.conflicts.length > 0,
  };
}

function dedupeLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** Persist a label set and re-derive the cached triage metadata from it. */
function writeLabels(
  repo: RepoRow,
  number: number,
  labels: readonly string[],
): { row: typeof mirrorThread.$inferSelect } {
  const unique = dedupeLabels(labels);
  replaceIssueLabels(repo.id, number, unique);
  setIssueMetadata(repo.id, number, metadataFor(unique));
  db.update(mirrorThread)
    .set({ updatedAt: Date.now() })
    .where(
      and(eq(mirrorThread.repoId, repo.id), eq(mirrorThread.number, number)),
    )
    .run();
  bumpRevision();
  return { row: getIssue(repo.id, number)! };
}

function replaceAssignees(
  repoId: number,
  number: number,
  users: readonly UserRecord[],
): void {
  const ids = [...new Set(users.map((user) => user.id))];
  db.transaction((tx) => {
    tx.delete(mirrorThreadAssignee)
      .where(
        and(
          eq(mirrorThreadAssignee.repoId, repoId),
          eq(mirrorThreadAssignee.threadNumber, number),
        ),
      )
      .run();
    if (ids.length > 0) {
      tx.insert(mirrorThreadAssignee)
        .values(
          ids.map((userId) => ({
            repoId,
            threadNumber: number,
            userId,
          })),
        )
        .run();
    }
  });
  bumpRevision();
}

function nextNumber(
  rows: readonly { number: number }[],
  fallback = 1,
): number {
  return rows.reduce((max, row) => Math.max(max, row.number), fallback - 1) + 1;
}

function nextExternalId(externalIds: readonly string[]): string {
  let max = 0;
  for (const externalId of externalIds) {
    const value = Number(externalId);
    if (Number.isInteger(value) && value > max) max = value;
  }
  return String(max + 1);
}

function nextIssueNumber(repoId: number): number {
  const rows = db
    .select({ number: mirrorThread.number })
    .from(mirrorThread)
    .where(eq(mirrorThread.repoId, repoId))
    .all();
  return nextNumber(rows);
}

function nextThreadExternalId(repoId: number): string {
  return nextExternalId(
    db
      .select({ externalId: mirrorThread.externalId })
      .from(mirrorThread)
      .where(eq(mirrorThread.repoId, repoId))
      .all()
      .map((row) => row.externalId),
  );
}

function nextCommentId(repoId: number): number {
  const rows = db
    .select({ externalId: mirrorComment.externalId })
    .from(mirrorComment)
    .where(eq(mirrorComment.repoId, repoId))
    .all();
  return Number(nextExternalId(rows.map((row) => row.externalId)));
}

function requireComment(ref: CommentRef): {
  repo: RepoRow;
  number: number;
  row: typeof mirrorComment.$inferSelect;
} {
  const { repo, number } = requireIssue(ref.thread);
  const row = db
    .select()
    .from(mirrorComment)
    .where(
      and(
        eq(mirrorComment.repoId, repo.id),
        eq(mirrorComment.externalId, String(ref.id)),
      ),
    )
    .get();
  if (!row) {
    throw notFound(
      `Comment ${String(ref.id)} on ${repo.org}/${repo.name}#${number} not found`,
    );
  }
  return { repo, number, row };
}

/** Mirror one reaction toggle into the demo comment's stored summary. */
function writeReaction(
  ref: CommentRef,
  content: ReactionContent,
  active: boolean,
): void {
  const { repo, number, row } = requireComment(ref);
  const current = row.reactions ?? emptyReactions();
  const counts = { ...current.counts };
  const count = counts[content] ?? 0;
  if (active) {
    counts[content] = count + 1;
  } else if (count <= 1) {
    delete counts[content];
  } else {
    counts[content] = count - 1;
  }
  const reactions: CommentReactions = {
    total: Math.max(0, current.total + (active ? 1 : -1)),
    counts,
    viewerReacted: [],
  };
  db.update(mirrorComment)
    .set({ reactions })
    .where(
      and(
        eq(mirrorComment.repoId, repo.id),
        eq(mirrorComment.externalId, row.externalId),
      ),
    )
    .run();
  bumpRevision();
}

function nextMilestoneNumber(repoId: number): number {
  const rows = db
    .select({ number: mirrorMilestone.number })
    .from(mirrorMilestone)
    .where(eq(mirrorMilestone.repoId, repoId))
    .all();
  return nextNumber(rows);
}

function nextMilestoneExternalId(repoId: number): string {
  return nextExternalId(
    db
      .select({ externalId: mirrorMilestone.externalId })
      .from(mirrorMilestone)
      .where(eq(mirrorMilestone.repoId, repoId))
      .all()
      .map((row) => row.externalId),
  );
}

// ---------------------------------------------------------------------------
// REST payloads (what `provider.request()` and the passthrough serve)
// ---------------------------------------------------------------------------

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function restUser(user: UserRecord | undefined): Record<string, unknown> | null {
  if (!user) return null;
  return {
    login: user.login,
    id: Number(user.externalId) || 0,
    avatar_url: user.avatarUrl,
    html_url: user.url,
    type: "User",
  };
}

function restMilestone(
  record: MilestoneRecord,
  repo?: RepoRow,
): Record<string, unknown> {
  return {
    id: Number(record.externalId) || record.number,
    number: record.number,
    title: record.title,
    description: record.description,
    state: record.state,
    due_on: iso(record.dueOn),
    open_issues: record.openIssues,
    closed_issues: record.closedIssues,
    created_at: iso(record.createdAt),
    updated_at: iso(record.updatedAt),
    closed_at: iso(record.closedAt),
    html_url: record.url || (repo ? milestoneUrl(repo, record.number) : ""),
    creator: restUser(record.creator ?? undefined),
  };
}

function restIssue(
  repo: RepoRow,
  row: typeof mirrorThread.$inferSelect,
): Record<string, unknown> {
  const labels = getIssueLabels(repo.id, row.number);
  const colours = repoLabelColours(repo.id);
  const milestone =
    row.milestoneNumber === null
      ? null
      : getRepoMilestones(repo.id).find(
          (entry) => entry.number === row.milestoneNumber,
        );
  return {
    id: Number(row.externalId) || row.number,
    number: row.number,
    title: row.title,
    body: row.body,
    state: row.state,
    state_reason: row.stateReason,
    html_url: row.url || issueUrl(repo, row.number),
    user: restUser(userById(row.authorId)),
    labels: labels.map((name) => ({
      name,
      color: colours.get(name) ?? "",
    })),
    assignees: threadAssignees(repo.id, row.number).map((user) =>
      restUser(user),
    ),
    milestone: milestone ? restMilestone(milestone, repo) : null,
    comments: getIssueComments(repo.id, row.number).length,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
    closed_at: iso(row.closedAt),
  };
}

function restComment(
  repo: RepoRow,
  row: {
    externalId: string;
    body: string;
    authorId: number | null;
    createdAt: number;
    updatedAt: number;
  },
  threadNumber: number,
): Record<string, unknown> {
  return {
    id: Number(row.externalId) || 0,
    body: row.body,
    user: restUser(userById(row.authorId)),
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
    html_url: `${issueUrl(repo, threadNumber)}#issuecomment-${row.externalId}`,
  };
}

function restLabels(repo: RepoRow): Record<string, unknown>[] {
  return getRepoLabels(repo.id).map((label, index) => ({
    id: index + 1,
    name: label.name,
    color: label.color,
    description: label.description,
    default: false,
  }));
}

function queryOf(path: string, options?: RequestOptions): URLSearchParams {
  const question = path.indexOf("?");
  const search = new URLSearchParams(question >= 0 ? path.slice(question + 1) : "");
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search;
}

function queryValue(query: URLSearchParams, key: string): string | undefined {
  return query.get(key) ?? undefined;
}

function paginate<T>(items: readonly T[], query: URLSearchParams): T[] {
  const rawPerPage = Number(queryValue(query, "per_page") ?? 30);
  const perPage = Math.min(100, Math.max(1, Number.isFinite(rawPerPage) ? rawPerPage : 30));
  const rawPage = Number(queryValue(query, "page") ?? 1);
  const page = Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1);
  return items.slice((page - 1) * perPage, page * perPage);
}

function listIssues(repo: RepoRow, query: URLSearchParams): unknown[] {
  const state = queryValue(query, "state") ?? "open";
  const labelFilter = (queryValue(query, "labels") ?? "")
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
  const assignee = queryValue(query, "assignee")?.toLowerCase();
  const creator = queryValue(query, "creator")?.toLowerCase();
  const milestone = queryValue(query, "milestone");
  const since = queryValue(query, "since");

  let rows = db
    .select()
    .from(mirrorThread)
    .where(eq(mirrorThread.repoId, repo.id))
    .all();

  if (state !== "all") {
    rows = rows.filter((row) => row.state === state);
  }
  if (labelFilter.length > 0) {
    rows = rows.filter((row) => {
      const labels = new Set(
        getIssueLabels(repo.id, row.number).map((label) => label.toLowerCase()),
      );
      return labelFilter.every((label) => labels.has(label));
    });
  }
  if (assignee) {
    rows = rows.filter((row) =>
      threadAssignees(repo.id, row.number).some(
        (user) => user.login.toLowerCase() === assignee,
      ),
    );
  }
  if (creator) {
    rows = rows.filter(
      (row) =>
        userById(row.authorId)?.login.toLowerCase() === creator,
    );
  }
  if (milestone && milestone !== "*" && milestone !== "none") {
    const wanted = Number(milestone);
    rows = rows.filter((row) => row.milestoneNumber === wanted);
  } else if (milestone === "none") {
    rows = rows.filter((row) => row.milestoneNumber === null);
  }
  if (since) {
    const boundary = Date.parse(since);
    if (!Number.isNaN(boundary)) {
      rows = rows.filter((row) => row.updatedAt >= boundary);
    }
  }

  const sort = queryValue(query, "sort") ?? "created";
  const direction = queryValue(query, "direction") ?? "desc";
  const sign = direction === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const left =
      sort === "updated"
        ? a.updatedAt
        : sort === "comments"
          ? getIssueComments(repo.id, a.number).length
          : a.createdAt;
    const right =
      sort === "updated"
        ? b.updatedAt
        : sort === "comments"
          ? getIssueComments(repo.id, b.number).length
          : b.createdAt;
    return (left - right) * sign || b.number - a.number;
  });

  return paginate(rows, query).map((row) => restIssue(repo, row));
}

function listMilestones(repo: RepoRow, query: URLSearchParams): unknown[] {
  const state = queryValue(query, "state") ?? "open";
  const sort = queryValue(query, "sort") ?? "due_on";
  const direction = queryValue(query, "direction") ?? "asc";
  const sign = direction === "desc" ? -1 : 1;

  let rows = getRepoMilestones(repo.id);
  if (state !== "all") rows = rows.filter((row) => row.state === state);

  rows.sort((a, b) => {
    if (sort === "completeness") {
      return (a.openIssues - b.openIssues) * sign || a.number - b.number;
    }
    if (a.dueOn === null && b.dueOn === null) return a.number - b.number;
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return (a.dueOn - b.dueOn) * sign;
  });

  return paginate(rows, query).map((row) => restMilestone(row, repo));
}

function listComments(
  repo: RepoRow,
  number: number,
  query: URLSearchParams,
): unknown[] {
  const since = queryValue(query, "since");
  const boundary = since ? Date.parse(since) : Number.NaN;
  const rows = db
    .select()
    .from(mirrorComment)
    .where(
      and(
        eq(mirrorComment.repoId, repo.id),
        eq(mirrorComment.threadNumber, number),
      ),
    )
    .all()
    .filter(
      (row) =>
        Number.isNaN(boundary) || row.updatedAt >= boundary,
    )
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt || a.externalId.localeCompare(b.externalId),
    );
  return paginate(rows, query).map((row) => restComment(repo, row, number));
}

function restResponse<T>(status: number, data: T): RestResponse<T> {
  return {
    status,
    data,
    headers: new Headers({ "content-type": "application/json" }),
  };
}

// ---------------------------------------------------------------------------
// urlFor
// ---------------------------------------------------------------------------

interface UrlTargetLike {
  repo?: RepoRef;
  section?: string;
  thread?: ThreadRef;
  comment?: CommentRef;
}

function webBase(owner: string, name: string): string {
  return `https://${DEMO_INSTANCE}/${owner}/${name}`;
}

function urlFor(target: UrlTargetLike): string | undefined {
  if (target.thread) {
    const repo = target.thread.repo;
    return `${webBase(repo.owner, repo.name)}/issues/${target.thread.number}`;
  }
  if (target.comment) {
    const repo = target.comment.thread.repo;
    return `${webBase(repo.owner, repo.name)}/issues/${target.comment.thread.number}#issuecomment-${target.comment.id}`;
  }
  if (target.repo) {
    const base = webBase(target.repo.owner, target.repo.name);
    switch (target.section) {
      case "issues":
        return `${base}/issues`;
      case "pullRequests":
        return `${base}/pulls`;
      case "releases":
        return `${base}/releases`;
      case "compare":
        return `${base}/compare`;
      default:
        return base;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

function buildProvider(): GitHubProvider {
  const provider = {
    forge: FORGE,
    instance: DEMO_INSTANCE,
    baseUrl: `https://api.${DEMO_INSTANCE}`,
    authKind: "token",

    urlFor,

    repos: {
      /** Repo metadata for the post-create milestone refresh and mirror reads. */
      async get(ref: RepoRef): Promise<Repo> {
        const repo = findRepo(ref.owner, ref.name);
        return {
          ref: toRepoRef(repo),
          visibility: "private",
          isFork: false,
          isArchived: Boolean(repo.archived),
          topics: [],
          url: repo.url || webBase(repo.org, repo.name),
          raw: repo,
        };
      },
    },

    threads: {
      async get(ref: ThreadRef): Promise<Thread> {
        const { repo, row } = requireIssue(ref);
        return toThread(repo, row);
      },

      async setLabels(ref: ThreadRef, labels: string[]): Promise<Label[]> {
        const { repo, number } = requireIssue(ref);
        const { row } = writeLabels(repo, number, labels);
        return toLabels(repo, getIssueLabels(repo.id, row.number));
      },

      async addLabels(ref: ThreadRef, labels: string[]): Promise<Label[]> {
        const { repo, number } = requireIssue(ref);
        const merged = [...getIssueLabels(repo.id, number), ...labels];
        const { row } = writeLabels(repo, number, merged);
        return toLabels(repo, getIssueLabels(repo.id, row.number));
      },

      async removeLabels(ref: ThreadRef, labels: string[]): Promise<Label[]> {
        const { repo, number } = requireIssue(ref);
        const remove = new Set(labels.map((label) => label.toLowerCase()));
        const kept = getIssueLabels(repo.id, number).filter(
          (label) => !remove.has(label.toLowerCase()),
        );
        const { row } = writeLabels(repo, number, kept);
        return toLabels(repo, getIssueLabels(repo.id, row.number));
      },

      async update(ref: ThreadRef, input: ThreadUpdate): Promise<Thread> {
        const { repo, number } = requireIssue(ref);
        const now = Date.now();
        const patch: Partial<typeof mirrorThread.$inferInsert> = {
          updatedAt: now,
        };
        if (input.title !== undefined) patch.title = input.title;
        if (input.body !== undefined) patch.body = input.body;
        if (input.state === "open") {
          patch.state = "open";
          patch.stateReason = null;
          patch.closedAt = null;
        } else if (input.state === "closed") {
          patch.state = "closed";
          patch.stateReason = "completed";
          patch.closedAt = now;
        }

        db.update(mirrorThread)
          .set(patch)
          .where(
            and(
              eq(mirrorThread.repoId, repo.id),
              eq(mirrorThread.number, number),
            ),
          )
          .run();
        if (input.title !== undefined || input.body !== undefined) {
          refreshIssueSearchIndex(repo.id, number);
        }
        bumpRevision();

        if (input.assignees !== undefined) {
          replaceAssignees(
            repo.id,
            number,
            input.assignees.map(ensureUser),
          );
        }
        if (input.labels !== undefined) {
          writeLabels(repo, number, input.labels);
        }
        return toThread(repo, getIssue(repo.id, number)!);
      },

      async close(ref: ThreadRef, options?: CloseOptions): Promise<Thread> {
        const { repo, number } = requireIssue(ref);
        const now = Date.now();
        db.update(mirrorThread)
          .set({
            state: "closed",
            stateReason: options?.reasonRaw ?? options?.reason ?? "completed",
            closedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(mirrorThread.repoId, repo.id),
              eq(mirrorThread.number, number),
            ),
          )
          .run();
        bumpRevision();
        return toThread(repo, getIssue(repo.id, number)!);
      },

      async setMilestone(
        ref: ThreadRef,
        milestone: Milestone | string | number | undefined,
      ): Promise<Milestone | undefined> {
        const { repo, number } = requireIssue(ref);
        let next: number | null = null;
        let resolved: Milestone | undefined;

        if (milestone !== undefined) {
          const all = getRepoMilestones(repo.id);
          if (typeof milestone === "string" || typeof milestone === "number") {
            const numeric = Number(milestone);
            const match = Number.isInteger(numeric) && numeric > 0
              ? all.find((entry) => entry.number === numeric)
              : all.find((entry) => entry.title === String(milestone));
            if (match) {
              next = match.number;
              resolved = toMilestone(match);
            } else if (Number.isInteger(numeric) && numeric > 0) {
              next = numeric;
              resolved = {
                id: String(numeric),
                title: "",
                state: "open",
                raw: null,
              };
            } else {
              throw notFound(`Milestone ${String(milestone)} not found`);
            }
          } else {
            const match = all.find(
              (entry) =>
                entry.externalId === milestone.id ||
                entry.title === milestone.title,
            );
            if (!match) {
              throw notFound(`Milestone ${milestone.title} not found`);
            }
            next = match.number;
            resolved = toMilestone(match);
          }
        }

        db.update(mirrorThread)
          .set({ milestoneNumber: next, updatedAt: Date.now() })
          .where(
            and(
              eq(mirrorThread.repoId, repo.id),
              eq(mirrorThread.number, number),
            ),
          )
          .run();
        bumpRevision();
        return resolved;
      },

      async createComment(ref: ThreadRef, body: string): Promise<Comment> {
        const { repo, number } = requireIssue(ref);
        const author = demoUser();
        const id = nextCommentId(repo.id);
        const now = Date.now();
        db.insert(mirrorComment)
          .values({
            repoId: repo.id,
            threadNumber: number,
            externalId: String(id),
            authorId: author.id,
            body,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        refreshIssueSearchIndex(repo.id, number);
        bumpRevision();

        const comment = {
          id,
          ref: {
            forge: FORGE,
            instance: DEMO_INSTANCE,
            thread: {
              ...toThreadRef(repo, number),
              number: String(number),
            },
            id: String(id),
          },
          body,
          author: toActor(author),
          createdAt: new Date(now),
          updatedAt: new Date(now),
          url: `${issueUrl(repo, number)}#issuecomment-${id}`,
          raw: null,
        };
        return comment as unknown as Comment;
      },

      async updateComment(ref: CommentRef, body: string): Promise<Comment> {
        const { repo, number, row } = requireComment(ref);
        const now = Date.now();
        db.update(mirrorComment)
          .set({ body, updatedAt: now })
          .where(
            and(
              eq(mirrorComment.repoId, repo.id),
              eq(mirrorComment.externalId, row.externalId),
            ),
          )
          .run();
        refreshIssueSearchIndex(repo.id, number);
        bumpRevision();
        const author = userById(row.authorId);
        return {
          ref: {
            forge: FORGE,
            instance: DEMO_INSTANCE,
            thread: toThreadRef(repo, number),
            id: row.externalId,
          },
          body,
          author: author ? toActor(author) : undefined,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(now),
          url: `${issueUrl(repo, number)}#issuecomment-${row.externalId}`,
          raw: null,
        } as unknown as Comment;
      },

      async deleteComment(ref: CommentRef): Promise<void> {
        const { repo, number, row } = requireComment(ref);
        db.delete(mirrorComment)
          .where(
            and(
              eq(mirrorComment.repoId, repo.id),
              eq(mirrorComment.externalId, row.externalId),
            ),
          )
          .run();
        refreshIssueSearchIndex(repo.id, number);
        bumpRevision();
      },

      async react(
        ref: CommentRef,
        reaction: ReactionContent,
      ): Promise<void> {
        writeReaction(ref, reaction, true);
      },

      async unreact(
        ref: CommentRef,
        reaction: ReactionContent,
      ): Promise<void> {
        writeReaction(ref, reaction, false);
      },

      async create(repoRef: RepoRef, input: ThreadInput): Promise<Thread> {
        const repo = findRepo(repoRef.owner, repoRef.name);
        const number = nextIssueNumber(repo.id);
        const now = Date.now();
        const labels = dedupeLabels(input.labels ?? []);
        const assignees = (input.assignees ?? []).map(ensureUser);
        const author = demoUser();
        const record: IssueRecord = {
          externalId: nextThreadExternalId(repo.id),
          repoId: repo.id,
          number,
          kind: "issue",
          title: input.title,
          body: input.body ?? "",
          state: "open",
          stateReason: null,
          author,
          milestoneNumber: null,
          url: issueUrl(repo, number),
          createdAt: now,
          updatedAt: now,
          closedAt: null,
          labels,
          assignees,
          comments: [],
        };
        upsertIssue(record, metadataFor(labels));
        return toThread(repo, getIssue(repo.id, number)!);
      },
    },

    async request<T = unknown>(
      method: string,
      path: string,
      options?: RequestOptions,
    ): Promise<RestResponse<T>> {
      const query = queryOf(path, options);
      const pathname = path.split("?")[0]!;
      const parts = pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts[0] !== "repos" || parts.length < 3) {
        throw notFound(`${method} ${path} is not available in demo mode`);
      }
      const owner = parts[1]!;
      const name = parts[2]!;
      const rest = parts.slice(3);
      const repo = findRepo(owner, name);

      if (method === "POST") {
        if (rest.length === 1 && rest[0] === "milestones") {
          const body = (options?.body ?? {}) as RestMilestoneBody;
          const number = nextMilestoneNumber(repo.id);
          const externalId = nextMilestoneExternalId(repo.id);
          const now = Date.now();
          const rawDue = typeof body.due_on === "string" ? body.due_on : null;
          const dueOn = rawDue ? Date.parse(rawDue) : null;
          const creator = demoUser();
          db.insert(mirrorMilestone)
            .values({
              repoId: repo.id,
              number,
              externalId,
              title: typeof body.title === "string" ? body.title : "",
              description:
                typeof body.description === "string" ? body.description : "",
              state: "open",
              dueOn: dueOn !== null && !Number.isNaN(dueOn) ? dueOn : null,
              openIssues: 0,
              closedIssues: 0,
              creatorId: creator.id,
              createdAt: now,
              updatedAt: now,
              closedAt: null,
              url: milestoneUrl(repo, number),
            })
            .run();
          bumpRevision();
          const row = getRepoMilestones(repo.id).find(
            (entry) => entry.number === number,
          )!;
          return restResponse(201, restMilestone(row, repo) as T);
        }
        throw notFound(`${method} ${path} is not available in demo mode`);
      }

      if (method !== "GET") {
        throw notFound(`${method} ${path} is not available in demo mode`);
      }

      if (rest.length === 1 && rest[0] === "installation") {
        return restResponse(200, {
          id: 1,
          account: {
            login: DEMO_USER_LOGIN,
            id: Number(DEMO_USER_EXTERNAL_ID),
            type: "Organization",
          },
        } as T);
      }

      if (rest.length === 1 && rest[0] === "labels") {
        return restResponse(200, paginate(restLabels(repo), query) as T);
      }

      if (rest.length === 1 && rest[0] === "milestones") {
        return restResponse(200, listMilestones(repo, query) as T);
      }

      if (rest.length === 1 && rest[0] === "issues") {
        return restResponse(200, listIssues(repo, query) as T);
      }

      if (rest.length === 2 && rest[0] === "issues") {
        const number = Number(rest[1]);
        const row = Number.isInteger(number)
          ? getIssue(repo.id, number)
          : undefined;
        if (!row) {
          throw notFound(`Issue ${owner}/${name}#${rest[1]} not found`);
        }
        return restResponse(200, restIssue(repo, row) as T);
      }

      if (
        rest.length === 3 &&
        rest[0] === "issues" &&
        rest[2] === "comments"
      ) {
        const number = Number(rest[1]);
        if (!Number.isInteger(number) || !getIssue(repo.id, number)) {
          throw notFound(`Issue ${owner}/${name}#${rest[1]} not found`);
        }
        return restResponse(200, listComments(repo, number, query) as T);
      }

      throw notFound(`${method} ${path} is not available in demo mode`);
    },
  };

  return provider as unknown as GitHubProvider;
}

let cached: GitHubProvider | undefined;

/**
 * The mirror-backed provider demo mode hands to every forge accessor.
 * Reads and writes the regular `mirror_*` tables; never calls `fetch`.
 */
export function demoProvider(): GitHubProvider {
  return (cached ??= buildProvider());
}
