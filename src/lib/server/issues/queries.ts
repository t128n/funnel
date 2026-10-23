/**
 * Local read service over the disposable mirror (SPEC §1.4, §2.1, §9.4).
 *
 * Every cockpit view is a query against SQLite — no network on the read path.
 * Four views are exposed:
 *   - {@link inbox}: pending intake submissions + untriaged open issues;
 *   - {@link allIssues}: every triaged mirrored issue (open + closed);
 *   - {@link myIssues}: All Issues restricted to the signed-in viewer;
 *   - {@link statusBoard}: the six-column board (`board.done_days` window).
 *
 * Rows are hydrated in two batched child queries (labels, assignees) keyed on
 * `(repo_id, issue_number)`, so a stream never devolves into N+1 lookups.
 */
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { isValidISODate } from "#lib/attention";
import { getConfig } from "#lib/server/config";
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
import { listAttachments } from "#lib/server/attachments/store";
import {
  countPendingSubmissions,
  listSubmissions,
} from "#lib/server/intake/staging";
import { listRepos } from "#lib/server/sync/mirror";
import { mirrorRevision } from "#lib/server/sync/revision";
import { listWorkNotes } from "#lib/server/work-notes";
import { readBlocked } from "#lib/funnel-metadata";
import {
  isRetiredPriorityLabel,
  parseImpact,
  parseUrgency,
} from "#lib/priority";
import {
  assigneeExists,
  buildIssueWhere,
  RESERVED_GROUP,
  type IssueFilter,
  type IssueFilterContext,
  STATUS_VALUES,
} from "./filters";
import {
  BOARD_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  filterSignature,
  ISSUE_PAGE_SIZE,
  pageLimit,
  type BoardColumnPage,
  type ListPage,
  type PageOptions,
  type PagedStatusBoard,
} from "./pagination";
import type {
  AttentionItem,
  CommentItem,
  FilterOptions,
  InboxEntry,
  IssueDetail,
  IssueListItem,
  IssueOption,
  MilestoneItem,
  RepoMilestoneRef,
  StatusKey,
  UserRef,
} from "./types";

const DAY_MS = 86_400_000;

const BOARD_LABELS: Record<StatusKey, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In Progress",
  "in-review": "In Review",
  done: "Done",
};

/** Default sort: derived priority rank (P1 first, unprioritized last) then updated. */
const PRIORITY_RANK = mirrorThread.priorityRank;

const issueColumns = {
  repoId: mirrorThread.repoId,
  number: mirrorThread.number,
  title: mirrorThread.title,
  state: mirrorThread.state,
  stateReason: mirrorThread.stateReason,
  status: mirrorThread.status,
  priority: mirrorThread.priority,
  priorityRank: mirrorThread.priorityRank,
  impact: mirrorThread.impact,
  urgency: mirrorThread.urgency,
  size: mirrorThread.size,
  blocked: mirrorThread.blocked,
  labelConflict: mirrorThread.labelConflict,
  createdAt: mirrorThread.createdAt,
  updatedAt: mirrorThread.updatedAt,
  closedAt: mirrorThread.closedAt,
  org: mirrorRepo.org,
  name: mirrorRepo.name,
  authorExternalId: mirrorUser.externalId,
  authorForge: mirrorUser.forge,
  authorInstance: mirrorUser.instance,
  authorLogin: mirrorUser.login,
  authorAvatar: mirrorUser.avatarUrl,
  milestoneNumber: mirrorThread.milestoneNumber,
  milestoneTitle: mirrorMilestone.title,
  milestoneState: mirrorMilestone.state,
  milestoneDueOn: mirrorMilestone.dueOn,
};

interface RawRow {
  repoId: number;
  number: number;
  title: string;
  state: string;
  stateReason: string | null;
  status: string | null;
  priority: string | null;
  priorityRank: number;
  impact: number | null;
  urgency: number | null;
  size: string | null;
  blocked: number;
  labelConflict: number;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  org: string;
  name: string;
  authorExternalId: string | null;
  authorForge: string | null;
  authorInstance: string | null;
  authorLogin: string | null;
  authorAvatar: string | null;
  milestoneNumber: number | null;
  milestoneTitle: string | null;
  milestoneState: string | null;
  milestoneDueOn: number | null;
}

/** Build a {@link UserRef} from inner-joined mirror user columns. */
function userRef(row: {
  externalId: string;
  forge: string;
  instance: string;
  login: string;
  avatarUrl: string;
}): UserRef {
  return {
    externalId: row.externalId,
    forge: row.forge,
    instance: row.instance,
    login: row.login,
    avatarUrl: row.avatarUrl,
  };
}

/** Build a {@link UserRef} from left-joined user columns (`null` when absent). */
function nullableUserRef(
  externalId: string | null,
  forge: string | null,
  instance: string | null,
  login: string | null,
  avatarUrl: string | null,
): UserRef | null {
  if (externalId === null || login === null) return null;
  return {
    externalId,
    forge: forge ?? "",
    instance: instance ?? "",
    login,
    avatarUrl: avatarUrl ?? "",
  };
}

/** Stable dedupe key for a forge person. */
function userKey(user: UserRef): string {
  return `${user.forge}\u0000${user.instance}\u0000${user.externalId}`;
}

export interface ListOptions {
  /** Cap the number of rows returned (streams may page in the UI). */
  limit?: number;
}

/** Build the {@link IssueFilterContext} for parsing URL params. */
export function filterContext(
  viewerExternalId?: string | null,
): IssueFilterContext {
  return {
    repos: listRepos().map((repo) => ({
      id: repo.id,
      org: repo.org,
      name: repo.name,
    })),
    viewerExternalId: viewerExternalId ?? null,
    resolveLogin: (login) => {
      const row = db
        .select({ externalId: mirrorUser.externalId })
        .from(mirrorUser)
        .where(sql`${mirrorUser.login} = ${login} COLLATE NOCASE`)
        .get();
      return row?.externalId;
    },
  };
}

function rawQuery(where: SQL | undefined, opts: ListOptions): RawRow[] {
  const query = db
    .select(issueColumns)
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .leftJoin(mirrorUser, eq(mirrorThread.authorId, mirrorUser.id))
    .leftJoin(
      mirrorMilestone,
      and(
        eq(mirrorMilestone.repoId, mirrorThread.repoId),
        eq(mirrorMilestone.number, mirrorThread.milestoneNumber),
      ),
    )
    .where(where)
    .orderBy(
      PRIORITY_RANK,
      desc(mirrorThread.updatedAt),
      desc(mirrorThread.repoId),
      desc(mirrorThread.number),
    );

  const rows = opts.limit ? query.limit(opts.limit).all() : query.all();
  return rows as RawRow[];
}

/**
 * Keyset predicate resuming strictly after `key` in the fixed sort order
 * (rank ASC, updatedAt DESC, repoId DESC, number DESC). Uses the persisted
 * rank column, the same one the `ORDER BY` uses, so the two cannot drift.
 */
function cursorWhere(key: [number, number, number, number]): SQL {
  const [rank, updatedAt, repoId, number] = key;
  return sql`(
    ${PRIORITY_RANK} > ${rank}
    OR (${PRIORITY_RANK} = ${rank} AND (
      ${mirrorThread.updatedAt} < ${updatedAt}
      OR (${mirrorThread.updatedAt} = ${updatedAt} AND (
        ${mirrorThread.repoId} < ${repoId}
        OR (${mirrorThread.repoId} = ${repoId}
          AND ${mirrorThread.number} < ${number})
      ))
    ))
  )`;
}

/** Count rows matching a `WHERE` without hydrating children (plan T1). */
function countRows(where: SQL | undefined): number {
  const row = db
    .select({ value: sql<number>`count(*)` })
    .from(mirrorThread)
    .where(where)
    .get();
  return Number(row?.value ?? 0);
}

/**
 * Page totals live across cursor pages (plan T4): the same filter pages
 * repeatedly, and each page otherwise re-runs `count(*)` over the same rows.
 * Entries are keyed by mirror revision plus the filter signature, so a write
 * that published can never serve a count from before it, and are kept for a
 * short TTL so a long-lived process does not pin an unbounded map. Totals were
 * always computed server-side; this only avoids repeating the same query.
 */
const TOTAL_TTL_MS = 5_000;
const TOTAL_CACHE_LIMIT = 256;
const totalCache = new Map<string, { value: number; at: number }>();

/** Filter-option lists, valid until the next mirror revision (plan T4). */
let optionsCache: { revision: number; value: FilterOptions } | null = null;

/** Drop every read cache; the mirror changed outside the revision bump. */
export function clearQueryCaches(): void {
  optionsCache = null;
  totalCache.clear();
}

/** {@link countRows} memoised by revision + filter signature for a short TTL. */
function cachedCount(where: SQL | undefined, signature: string): number {
  const key = `${mirrorRevision()}:${signature}`;
  const now = Date.now();
  const hit = totalCache.get(key);
  if (hit && now - hit.at < TOTAL_TTL_MS) return hit.value;

  const value = countRows(where);
  if (totalCache.size >= TOTAL_CACHE_LIMIT) {
    // Insertion order is age order, so this drops the oldest entry.
    const oldest = totalCache.keys().next();
    if (!oldest.done) totalCache.delete(oldest.value);
  }
  totalCache.set(key, { value, at: now });
  return value;
}

/**
 * Fetch one page of issues plus the unpaged total. Fetches `limit + 1` rows to
 * learn whether a further page exists, then hydrates only `limit`. A cursor
 * that fails to decode (malformed or from another filter) falls back to the
 * first page.
 */
function pageIssues(
  where: SQL | undefined,
  opts: PageOptions,
  signature: string,
  defaultSize: number,
): ListPage<IssueListItem> {
  const limit = pageLimit(opts.limit, defaultSize);
  const key = opts.cursor ? decodeCursor(opts.cursor, signature) : null;
  const after = key ? cursorWhere(key) : undefined;
  const pageWhere = after ? (where ? and(where, after) : after) : where;

  const rows = rawQuery(pageWhere, { limit: limit + 1 });
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = hydrate(pageRows);
  const last = pageRows[pageRows.length - 1];

  return {
    items,
    total: cachedCount(where, signature),
    nextCursor:
      hasMore && last
        ? encodeCursor(signature, [
            last.priorityRank,
            last.updatedAt,
            last.repoId,
            last.number,
          ])
        : null,
  };
}

/** Row key shared by the batched label/assignee lookups. */
function rowKey(repoId: number, number: number): string {
  return `${repoId}:${number}`;
}

/** Attach labels and assignees to raw issue rows in two batched queries. */
function hydrate(rows: RawRow[]): IssueListItem[] {
  if (rows.length === 0) return [];

  const tuple = sql.join(
    rows.map((row) => sql`(${row.repoId}, ${row.number})`),
    sql`, `,
  );

  const labelRows = db
    .select({
      repoId: mirrorThreadLabel.repoId,
      number: mirrorThreadLabel.threadNumber,
      name: mirrorThreadLabel.labelName,
    })
    .from(mirrorThreadLabel)
    .where(
      sql`(${mirrorThreadLabel.repoId}, ${mirrorThreadLabel.threadNumber}) IN (${tuple})`,
    )
    .all();

  const assigneeRows = db
    .select({
      repoId: mirrorThreadAssignee.repoId,
      number: mirrorThreadAssignee.threadNumber,
      externalId: mirrorUser.externalId,
      forge: mirrorUser.forge,
      instance: mirrorUser.instance,
      login: mirrorUser.login,
      avatarUrl: mirrorUser.avatarUrl,
    })
    .from(mirrorThreadAssignee)
    .innerJoin(mirrorUser, eq(mirrorThreadAssignee.userId, mirrorUser.id))
    .where(
      sql`(${mirrorThreadAssignee.repoId}, ${mirrorThreadAssignee.threadNumber}) IN (${tuple})`,
    )
    .all();

  const labels = new Map<string, string[]>();
  for (const row of labelRows) {
    const key = rowKey(row.repoId, row.number);
    const list = labels.get(key) ?? [];
    list.push(row.name);
    labels.set(key, list);
  }

  const assignees = new Map<string, UserRef[]>();
  for (const row of assigneeRows) {
    const key = rowKey(row.repoId, row.number);
    const list = assignees.get(key) ?? [];
    list.push(userRef(row));
    assignees.set(key, list);
  }

  return rows.map((row) => {
    const key = rowKey(row.repoId, row.number);
    const repo = `${row.org}/${row.name}`;
    return {
      repoId: row.repoId,
      repo,
      number: row.number,
      title: row.title,
      state: row.state,
      stateReason: row.stateReason,
      status: row.status,
      priority: row.priority,
      impact: parseImpact(row.impact),
      urgency: parseUrgency(row.urgency),
      size: row.size,
      blocked: row.blocked === 1,
      labelConflict: row.labelConflict === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      closedAt: row.closedAt,
      author: nullableUserRef(
        row.authorExternalId,
        row.authorForge,
        row.authorInstance,
        row.authorLogin,
        row.authorAvatar,
      ),
      assignees: assignees.get(key) ?? [],
      milestone:
        row.milestoneNumber !== null && row.milestoneTitle !== null
          ? {
              repo,
              number: row.milestoneNumber,
              title: row.milestoneTitle,
              state: row.milestoneState ?? "open",
              dueOn: row.milestoneDueOn,
            }
          : null,
      labels: labels.get(key) ?? [],
    } satisfies IssueListItem;
  });
}

/**
 * All Issues: every mirrored issue that has been triaged (carries a status
 * label). Untriaged issues belong to the Inbox instead, so they are excluded
 * here to keep the two views a clean partition.
 */
export function allIssues(
  filter: IssueFilter,
  opts: PageOptions = {},
): ListPage<IssueListItem> {
  const base = buildIssueWhere(filter);
  const triaged = isNotNull(mirrorThread.status);
  const where = base ? and(base, triaged) : triaged;
  return pageIssues(where, opts, filterSignature(filter), ISSUE_PAGE_SIZE);
}

/**
 * My Issues: All Issues restricted to issues assigned to
 * `viewerExternalId` (the signed-in user's forge-native id).
 */
export function myIssues(
  filter: IssueFilter,
  viewerExternalId: string | null | undefined,
  opts: PageOptions = {},
): ListPage<IssueListItem> {
  if (
    viewerExternalId === null ||
    viewerExternalId === undefined ||
    viewerExternalId.length === 0
  ) {
    return { items: [], total: 0, nextCursor: null };
  }
  const base = buildIssueWhere({ ...filter, assignees: [] });
  const viewer = assigneeExists([viewerExternalId]);
  const where = base ? and(base, viewer) : viewer;
  return pageIssues(
    where,
    opts,
    filterSignature({ ...filter, assignees: [] }, `viewer:${viewerExternalId}`),
    ISSUE_PAGE_SIZE,
  );
}

/** A single issue row by mirror identity (Inspector Pane, Milestone 6). */
export function getIssueListItem(
  repoId: number,
  number: number,
): IssueListItem | undefined {
  const where = and(
    eq(mirrorThread.repoId, repoId),
    eq(mirrorThread.number, number),
  );
  return hydrate(rawQuery(where, {}))[0];
}

/**
 * Every mirrored issue (open and closed, triaged or not) attached to one
 * repo-scoped milestone. Backs the Milestones detail view.
 */
export function milestoneIssues(
  repoId: number,
  milestoneNumber: number,
  opts: ListOptions = {},
): IssueListItem[] {
  return hydrate(
    rawQuery(
      and(
        eq(mirrorThread.repoId, repoId),
        eq(mirrorThread.milestoneNumber, milestoneNumber),
      ),
      opts,
    ),
  );
}

function matchesSearch(
  search: string,
  ...fields: Array<string | null | undefined>
): boolean {
  if (search.length === 0) return true;
  const needle = search.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

export interface InboxResult extends ListPage<InboxEntry> {
  /** Backwards-compatible alias for {@link ListPage.items}. */
  entries: InboxEntry[];
}

/** Pending submissions matching the search term (submissions carry no metadata). */
function pendingSubmissions(filter: IssueFilter) {
  return listSubmissions().filter((submission) =>
    matchesSearch(filter.search, submission.title, submission.body),
  );
}

/** The `WHERE` for untriaged open issues (SQL mirror of `isUntriaged`). */
function untriagedWhere(filter: IssueFilter): SQL {
  // Keep in step with `isUntriaged` (#lib/labels), which the client projects the
  // queue with.
  const untriaged = and(
    eq(mirrorThread.state, "open"),
    isNull(mirrorThread.status),
  );
  const base = buildIssueWhere(filter);
  return (base ? and(untriaged, base) : untriaged) as SQL;
}

/**
 * Inbox (SPEC §2.1): pending intake submissions followed by untriaged issues
 * (open, no status label). Filters apply to the GitHub issues; the search term
 * also matches submission title/body. Submissions are always returned because
 * they carry no repo/status/assignee metadata to filter on, so they are
 * included on every page and the client de-duplicates them by id.
 */
export function inbox(
  filter: IssueFilter,
  opts: PageOptions = {},
): InboxResult {
  const submissions = pendingSubmissions(filter);
  const page = pageIssues(
    untriagedWhere(filter),
    opts,
    // The `inbox` discriminator keeps this cursor from being replayed against
    // the disjoint All Issues feed, whose filter signature is otherwise equal.
    filterSignature(filter, "inbox"),
    ISSUE_PAGE_SIZE,
  );

  const items: InboxEntry[] = [
    ...submissions.map(
      (submission): InboxEntry => ({ kind: "submission", submission }),
    ),
    ...page.items.map((issue): InboxEntry => ({ kind: "issue", issue })),
  ];
  return {
    items,
    entries: items,
    total: submissions.length + page.total,
    nextCursor: page.nextCursor,
  };
}

/**
 * Inbox badge count: pending submissions plus untriaged open issues, without
 * materialising (or hydrating) the queue.
 */
export function inboxCount(filter: IssueFilter): number {
  return (
    countPendingSubmissions(filter.search) +
    cachedCount(untriagedWhere(filter), filterSignature(filter, "inbox"))
  );
}

/** Build the `WHERE` for one board lane (status columns or the Done window). */
function boardColumnWhere(
  filter: IssueFilter,
  column: StatusKey,
  cutoff: number,
): SQL {
  const base = buildIssueWhere({ ...filter, statuses: [] });
  const clause =
    column === "done"
      ? and(
          eq(mirrorThread.state, "closed"),
          eq(mirrorThread.stateReason, "completed"),
          gte(mirrorThread.closedAt, cutoff),
        )
      : and(
          eq(mirrorThread.state, "open"),
          eq(mirrorThread.status, column),
        );
  return (base ? and(base, clause) : clause) as SQL;
}

/** One page of a single board lane, with the lane's server-side total. */
export async function boardColumnPage(
  filter: IssueFilter,
  column: StatusKey,
  opts: PageOptions = {},
): Promise<ListPage<IssueListItem>> {
  if (!(column in BOARD_LABELS)) throw new Error(`Unknown column: ${column}`);
  const { board } = await getConfig();
  const cutoff = Date.now() - board.done_days * DAY_MS;
  return pageIssues(
    boardColumnWhere(filter, column, cutoff),
    opts,
    filterSignature({ ...filter, statuses: [] }, `board:${column}`),
    BOARD_PAGE_SIZE,
  );
}

/**
 * Status Board (SPEC §9.3): four open columns by status label plus a Done
 * column of issues closed as completed within `board.done_days`. Blocking is an
 * orthogonal flag on the card, not a lane, so it never appears here. Canceled
 * issues are omitted. The status filter dimension is ignored here — the columns
 * already partition by status — while every other dimension applies.
 *
 * Each column carries its own server-computed `total` and first-page
 * `nextCursor`; further pages come from {@link boardColumnPage}.
 */
export async function statusBoard(
  filter: IssueFilter,
  opts: PageOptions = {},
): Promise<PagedStatusBoard> {
  const { board } = await getConfig();
  const cutoff = Date.now() - board.done_days * DAY_MS;
  const signatureBase = { ...filter, statuses: [] };

  const columnPage = (column: StatusKey): BoardColumnPage => {
    const page = pageIssues(
      boardColumnWhere(filter, column, cutoff),
      { limit: opts.limit },
      filterSignature(signatureBase, `board:${column}`),
      BOARD_PAGE_SIZE,
    );
    return {
      key: column,
      label: BOARD_LABELS[column],
      issues: page.items,
      total: page.total,
      nextCursor: page.nextCursor,
    };
  };

  return {
    columns: [...STATUS_VALUES.map(columnPage), columnPage("done")],
  };
}

/**
 * Attention (SPEC §5.1): open issues flagged `blocked` (the label is the source
 * of truth), grouped by the re-check date in their body metadata. Issues with a
 * missing or malformed date are returned too (with `recheck: ""`) so blocked
 * work can never disappear from the view; the UI puts them in its "No re-check
 * date" group. The mirror stores the body, so the date is parsed on read with
 * the shared `funnel-metadata` helper rather than cached in a column; blocked
 * issues are few, so the scan is cheap. Dated items sort first by date, then
 * undated items by issue number.
 */
export function attentionIssues(): AttentionItem[] {
  const rows = db
    .select({ ...issueColumns, body: mirrorThread.body })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .leftJoin(mirrorUser, eq(mirrorThread.authorId, mirrorUser.id))
    .leftJoin(
      mirrorMilestone,
      and(
        eq(mirrorMilestone.repoId, mirrorThread.repoId),
        eq(mirrorMilestone.number, mirrorThread.milestoneNumber),
      ),
    )
    .where(and(eq(mirrorThread.state, "open"), eq(mirrorThread.blocked, 1)))
    .orderBy(asc(mirrorThread.updatedAt))
    .all();

  const bodies = new Map<string, string>();
  for (const row of rows) bodies.set(rowKey(row.repoId, row.number), row.body);

  const items: AttentionItem[] = [];
  for (const issue of hydrate(rows as unknown as RawRow[])) {
    // The `blocked` column (the label) is the source of truth for inclusion;
    // the body envelope only enriches the row. Manually labelled issues have no
    // envelope and must still surface.
    const blocked = readBlocked(bodies.get(rowKey(issue.repoId, issue.number)) ?? "");
    const raw = blocked.info?.recheck ?? "";
    const recheck = isValidISODate(raw) ? raw : "";
    items.push({
      issue,
      blocker: blocked.info?.blocker ?? "",
      needs: blocked.info?.needs ?? "",
      trying: blocked.info?.trying ?? "",
      recheck,
    });
  }

  return items.sort((a, b) => {
    if (a.recheck && b.recheck) {
      return a.recheck.localeCompare(b.recheck) || a.issue.number - b.issue.number;
    }
    if (a.recheck) return -1;
    if (b.recheck) return 1;
    return a.issue.number - b.issue.number;
  });
}

/**
 * Option lists for the filter bar and pickers: mirrored repos, users that are
 * assignable in at least one repo (union with anyone currently assigned, so a
 * historical assignee who lost collaborator access stays filterable), and every
 * non-reserved label in use.
 *
 * The whole list is cached until the mirror revision moves (plan T4): the
 * filter bar is loaded on every cockpit navigation, while labels/assignees only
 * change on a sync write or mutation, both of which `publish` and therefore
 * bump the revision. Duplicate rows are eliminated in SQL (`DISTINCT`) rather
 * than by scanning every assignment in JavaScript.
 */
export function filterOptions(): FilterOptions {
  const revision = mirrorRevision();
  if (optionsCache?.revision === revision) return optionsCache.value;

  const value = computeFilterOptions();
  optionsCache = { revision, value };
  return value;
}

/** Unbuffered {@link filterOptions} scan. */
function computeFilterOptions(): FilterOptions {
  const repos = listRepos()
    .map((repo) => ({ id: repo.id, slug: `${repo.org}/${repo.name}` }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const userColumns = {
    externalId: mirrorUser.externalId,
    forge: mirrorUser.forge,
    instance: mirrorUser.instance,
    login: mirrorUser.login,
    avatarUrl: mirrorUser.avatarUrl,
  };

  const assignableRows = db
    .selectDistinct(userColumns)
    .from(mirrorRepoAssignee)
    .innerJoin(mirrorUser, eq(mirrorRepoAssignee.userId, mirrorUser.id))
    .orderBy(asc(mirrorUser.login))
    .all();

  const assignedRows = db
    .selectDistinct(userColumns)
    .from(mirrorThreadAssignee)
    .innerJoin(mirrorUser, eq(mirrorThreadAssignee.userId, mirrorUser.id))
    .orderBy(asc(mirrorUser.login))
    .all();

  const byIdentity = new Map<string, UserRef>();
  for (const row of [...assignableRows, ...assignedRows]) {
    const key = userKey(row);
    if (!byIdentity.has(key)) byIdentity.set(key, row);
  }
  const assignees = [...byIdentity.values()].sort((a, b) =>
    a.login.localeCompare(b.login),
  );

  const labelRows = db
    .selectDistinct({ name: mirrorThreadLabel.labelName })
    .from(mirrorThreadLabel)
    .orderBy(asc(mirrorThreadLabel.labelName))
    .all();
  const labels = labelRows
    .map((row) => row.name)
    .filter(
      (name) =>
        !RESERVED_GROUP.has(name.toLowerCase()) &&
        !isRetiredPriorityLabel(name),
    );

  const milestoneRows = db
    .select({
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      number: mirrorMilestone.number,
      title: mirrorMilestone.title,
    })
    .from(mirrorMilestone)
    .innerJoin(mirrorRepo, eq(mirrorMilestone.repoId, mirrorRepo.id))
    .all();
  const milestones = milestoneRows
    .map((row) => ({
      repo: `${row.org}/${row.name}`,
      number: row.number,
      title: row.title,
    }))
    .sort((a, b) =>
      a.title.localeCompare(b.title) || a.repo.localeCompare(b.repo),
    );

  return { repos, assignees, labels, milestones };
}

/**
 * Selectable duplicate targets for one repo (intake picker, SPEC §6.2):
 * mirrored issues ordered most recently updated first. Only identity and
 * state are returned — the picker needs neither labels nor assignees.
 */
export function repoIssueOptions(
  repoId: number,
  opts: ListOptions = {},
): IssueOption[] {
  const query = db
    .select({
      number: mirrorThread.number,
      title: mirrorThread.title,
      state: mirrorThread.state,
    })
    .from(mirrorThread)
    .where(eq(mirrorThread.repoId, repoId))
    .orderBy(desc(mirrorThread.updatedAt), desc(mirrorThread.number));

  const rows = opts.limit ? query.limit(opts.limit).all() : query.all();
  return rows as IssueOption[];
}

/** Assignable users for one repo (Inspector picker, SPEC §9.2). */
export function repoAssigneeOptions(repoId: number): UserRef[] {
  return db
    .select({
      externalId: mirrorUser.externalId,
      forge: mirrorUser.forge,
      instance: mirrorUser.instance,
      login: mirrorUser.login,
      avatarUrl: mirrorUser.avatarUrl,
    })
    .from(mirrorRepoAssignee)
    .innerJoin(mirrorUser, eq(mirrorRepoAssignee.userId, mirrorUser.id))
    .where(eq(mirrorRepoAssignee.repoId, repoId))
    .orderBy(asc(mirrorUser.login))
    .all();
}

/**
 * Milestones for a repo (or every mirrored repo when `repoId` is omitted).
 * Ordered by title so the picker and the Milestones view stay stable.
 */
export function listMilestones(repoId?: number): MilestoneItem[] {
  const rows = db
    .select({
      repoId: mirrorMilestone.repoId,
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      number: mirrorMilestone.number,
      title: mirrorMilestone.title,
      description: mirrorMilestone.description,
      state: mirrorMilestone.state,
      dueOn: mirrorMilestone.dueOn,
      openIssues: mirrorMilestone.openIssues,
      closedIssues: mirrorMilestone.closedIssues,
      creatorExternalId: mirrorUser.externalId,
      creatorForge: mirrorUser.forge,
      creatorInstance: mirrorUser.instance,
      creatorLogin: mirrorUser.login,
      creatorAvatar: mirrorUser.avatarUrl,
      url: mirrorMilestone.url,
      createdAt: mirrorMilestone.createdAt,
      updatedAt: mirrorMilestone.updatedAt,
      closedAt: mirrorMilestone.closedAt,
    })
    .from(mirrorMilestone)
    .innerJoin(mirrorRepo, eq(mirrorMilestone.repoId, mirrorRepo.id))
    .leftJoin(mirrorUser, eq(mirrorMilestone.creatorId, mirrorUser.id))
    .where(repoId === undefined ? undefined : eq(mirrorMilestone.repoId, repoId))
    .all();

  return rows
    .map(toMilestoneItem)
    .sort((a, b) => a.title.localeCompare(b.title) || a.repo.localeCompare(b.repo));
}

/** One milestone by repo identity, or `undefined` when not mirrored. */
export function getMilestone(
  repoId: number,
  number: number,
): MilestoneItem | undefined {
  return listMilestones(repoId).find((milestone) => milestone.number === number);
}

/** Project a milestone row onto the cockpit DTO, computing progress. */
function toMilestoneItem(row: {
  repoId: number;
  org: string;
  name: string;
  number: number;
  title: string;
  description: string;
  state: string;
  dueOn: number | null;
  openIssues: number;
  closedIssues: number;
  creatorExternalId: string | null;
  creatorForge: string | null;
  creatorInstance: string | null;
  creatorLogin: string | null;
  creatorAvatar: string | null;
  url: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}): MilestoneItem {
  const total = row.openIssues + row.closedIssues;
  return {
    repoId: row.repoId,
    repo: `${row.org}/${row.name}`,
    number: row.number,
    title: row.title,
    description: row.description,
    state: row.state,
    dueOn: row.dueOn,
    openIssues: row.openIssues,
    closedIssues: row.closedIssues,
    progress: total === 0 ? 0 : row.closedIssues / total,
    creator: nullableUserRef(
      row.creatorExternalId,
      row.creatorForge,
      row.creatorInstance,
      row.creatorLogin,
      row.creatorAvatar,
    ),
    url: row.url,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

/**
 * Full Inspector Pane payload for one issue: the stream row plus the body,
 * the raw comment thread (oldest first; rendered to HTML at the API boundary),
 * and the repo's label options.
 * Returns `undefined` when the issue is not mirrored.
 */
export function getIssueDetail(
  repoId: number,
  number: number,
): IssueDetail | undefined {
  const issue = getIssueListItem(repoId, number);
  if (!issue) return undefined;

  const bodyRow = db
    .select({ body: mirrorThread.body })
    .from(mirrorThread)
    .where(and(eq(mirrorThread.repoId, repoId), eq(mirrorThread.number, number)))
    .get();

  const commentRows = db
    .select({
      externalId: mirrorComment.externalId,
      body: mirrorComment.body,
      createdAt: mirrorComment.createdAt,
      authorExternalId: mirrorUser.externalId,
      authorForge: mirrorUser.forge,
      authorInstance: mirrorUser.instance,
      authorLogin: mirrorUser.login,
      authorAvatar: mirrorUser.avatarUrl,
    })
    .from(mirrorComment)
    .leftJoin(mirrorUser, eq(mirrorComment.authorId, mirrorUser.id))
    .where(
      and(
        eq(mirrorComment.repoId, repoId),
        eq(mirrorComment.threadNumber, number),
      ),
    )
    .orderBy(asc(mirrorComment.createdAt))
    .all();

  const comments: CommentItem[] = commentRows.map((row) => ({
    externalId: row.externalId,
    body: row.body,
    createdAt: row.createdAt,
    author: nullableUserRef(
      row.authorExternalId,
      row.authorForge,
      row.authorInstance,
      row.authorLogin,
      row.authorAvatar,
    ),
  }));

  const repoLabels = db
    .select({
      name: mirrorRepoLabel.name,
      color: mirrorRepoLabel.color,
    })
    .from(mirrorRepoLabel)
    .where(eq(mirrorRepoLabel.repoId, repoId))
    .orderBy(asc(mirrorRepoLabel.name))
    .all();

  // Assignable users for the picker, plus the issue's current assignees so
  // checked items always render even if they are no longer collaborators.
  const optionById = new Map<string, UserRef>();
  for (const user of [...repoAssigneeOptions(repoId), ...issue.assignees]) {
    const key = userKey(user);
    if (!optionById.has(key)) optionById.set(key, user);
  }
  const assigneeOptions = [...optionById.values()].sort((a, b) =>
    a.login.localeCompare(b.login),
  );

  // The repo's milestones, for the Inspector picker. The issue's current
  // milestone is guaranteed present (it is one of the repo's milestones).
  const milestoneOptions: RepoMilestoneRef[] = listMilestones(repoId).map(
    (milestone) => ({
      repo: milestone.repo,
      number: milestone.number,
      title: milestone.title,
      state: milestone.state,
      dueOn: milestone.dueOn,
    }),
  );

  // Funnel-owned state (work notes, attachments) is keyed by `owner/name`, not
  // the disposable `repoId`, so it outlives mirror pruning and re-sync.
  const [org, name] = issue.repo.split("/");

  return {
    issue,
    body: bodyRow?.body ?? "",
    comments,
    workNotes: listWorkNotes(org, name, number),
    attachments: listAttachments(org, name, number),
    repoLabels,
    assigneeOptions,
    milestoneOptions,
  };
}
