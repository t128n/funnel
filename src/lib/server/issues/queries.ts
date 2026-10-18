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
import { getConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  mirrorGithubComment,
  mirrorGithubIssue,
  mirrorGithubIssueAssignee,
  mirrorGithubIssueLabel,
  mirrorGithubRepo,
  mirrorGithubRepoAssignee,
  mirrorGithubRepoLabel,
  mirrorGithubUser,
} from "#lib/server/db/schema";
import { listSubmissions } from "#lib/server/intake/staging";
import { listRepos } from "#lib/server/sync/mirror";
import {
  assigneeExists,
  buildIssueWhere,
  RESERVED_GROUP,
  type FilterContext,
  type IssueFilter,
  STATUS_VALUES,
} from "./filters";
import type {
  BoardColumn,
  CommentItem,
  FilterOptions,
  InboxEntry,
  IssueDetail,
  IssueListItem,
  IssueOption,
  StatusBoard,
  StatusKey,
  UserRef,
} from "./types";

const DAY_MS = 86_400_000;

const BOARD_LABELS: Record<StatusKey, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In Progress",
  "in-review": "In Review",
  blocked: "Blocked",
  done: "Done",
};

/** Default sort: priority (p1 first, unprioritized last) then updated. */
const PRIORITY_RANK = sql`case ${mirrorGithubIssue.priority} when 'p1' then 0 when 'p2' then 1 when 'p3' then 2 else 3 end`;

const issueColumns = {
  repoId: mirrorGithubIssue.repoId,
  number: mirrorGithubIssue.number,
  title: mirrorGithubIssue.title,
  state: mirrorGithubIssue.state,
  stateReason: mirrorGithubIssue.stateReason,
  status: mirrorGithubIssue.status,
  priority: mirrorGithubIssue.priority,
  size: mirrorGithubIssue.size,
  labelConflict: mirrorGithubIssue.labelConflict,
  createdAt: mirrorGithubIssue.createdAt,
  updatedAt: mirrorGithubIssue.updatedAt,
  closedAt: mirrorGithubIssue.closedAt,
  org: mirrorGithubRepo.org,
  name: mirrorGithubRepo.name,
  authorId: mirrorGithubUser.githubId,
  authorLogin: mirrorGithubUser.login,
  authorAvatar: mirrorGithubUser.avatarUrl,
};

interface RawRow {
  repoId: number;
  number: number;
  title: string;
  state: string;
  stateReason: string | null;
  status: string | null;
  priority: string | null;
  size: string | null;
  labelConflict: number;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  org: string;
  name: string;
  authorId: number | null;
  authorLogin: string | null;
  authorAvatar: string | null;
}

export interface ListOptions {
  /** Cap the number of rows returned (streams may page in the UI). */
  limit?: number;
}

/** Build the {@link FilterContext} for parsing URL params. */
export function filterContext(
  viewerGithubId?: number | null,
): FilterContext {
  return {
    repos: listRepos(),
    viewerGithubId: viewerGithubId ?? null,
    resolveLogin: (login) => {
      const row = db
        .select({ id: mirrorGithubUser.githubId })
        .from(mirrorGithubUser)
        .where(sql`lower(${mirrorGithubUser.login}) = lower(${login})`)
        .get();
      return row?.id;
    },
  };
}

function rawQuery(where: SQL | undefined, opts: ListOptions): RawRow[] {
  const query = db
    .select(issueColumns)
    .from(mirrorGithubIssue)
    .innerJoin(
      mirrorGithubRepo,
      eq(mirrorGithubIssue.repoId, mirrorGithubRepo.githubId),
    )
    .leftJoin(
      mirrorGithubUser,
      eq(mirrorGithubIssue.authorId, mirrorGithubUser.githubId),
    )
    .where(where)
    .orderBy(PRIORITY_RANK, desc(mirrorGithubIssue.updatedAt));

  const rows = opts.limit ? query.limit(opts.limit).all() : query.all();
  return rows as RawRow[];
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
      repoId: mirrorGithubIssueLabel.repoId,
      number: mirrorGithubIssueLabel.issueNumber,
      name: mirrorGithubIssueLabel.labelName,
    })
    .from(mirrorGithubIssueLabel)
    .where(
      sql`(${mirrorGithubIssueLabel.repoId}, ${mirrorGithubIssueLabel.issueNumber}) IN (${tuple})`,
    )
    .all();

  const assigneeRows = db
    .select({
      repoId: mirrorGithubIssueAssignee.repoId,
      number: mirrorGithubIssueAssignee.issueNumber,
      githubId: mirrorGithubUser.githubId,
      login: mirrorGithubUser.login,
      avatarUrl: mirrorGithubUser.avatarUrl,
    })
    .from(mirrorGithubIssueAssignee)
    .innerJoin(
      mirrorGithubUser,
      eq(mirrorGithubIssueAssignee.userId, mirrorGithubUser.githubId),
    )
    .where(
      sql`(${mirrorGithubIssueAssignee.repoId}, ${mirrorGithubIssueAssignee.issueNumber}) IN (${tuple})`,
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
    list.push({
      githubId: row.githubId,
      login: row.login,
      avatarUrl: row.avatarUrl,
    });
    assignees.set(key, list);
  }

  return rows.map((row) => {
    const key = rowKey(row.repoId, row.number);
    return {
      repoId: row.repoId,
      repo: `${row.org}/${row.name}`,
      number: row.number,
      title: row.title,
      state: row.state,
      stateReason: row.stateReason,
      status: row.status,
      priority: row.priority,
      size: row.size,
      labelConflict: row.labelConflict === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      closedAt: row.closedAt,
      author:
        row.authorId !== null && row.authorLogin !== null
          ? {
              githubId: row.authorId,
              login: row.authorLogin,
              avatarUrl: row.authorAvatar ?? "",
            }
          : null,
      assignees: assignees.get(key) ?? [],
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
  opts: ListOptions = {},
): IssueListItem[] {
  const base = buildIssueWhere(filter);
  const triaged = isNotNull(mirrorGithubIssue.status);
  return hydrate(rawQuery(base ? and(base, triaged) : triaged, opts));
}

/** My Issues: All Issues restricted to issues assigned to `viewerGithubId`. */
export function myIssues(
  filter: IssueFilter,
  viewerGithubId: number | null | undefined,
  opts: ListOptions = {},
): IssueListItem[] {
  if (viewerGithubId === null || viewerGithubId === undefined) return [];
  const base = buildIssueWhere({ ...filter, assignees: [] });
  const viewer = assigneeExists([viewerGithubId]);
  const where = base ? and(base, viewer) : viewer;
  return hydrate(rawQuery(where, opts));
}

/** A single issue row by mirror identity (Inspector Pane, Milestone 6). */
export function getIssueListItem(
  repoId: number,
  number: number,
): IssueListItem | undefined {
  const where = and(
    eq(mirrorGithubIssue.repoId, repoId),
    eq(mirrorGithubIssue.number, number),
  );
  return hydrate(rawQuery(where, {}))[0];
}

function matchesSearch(
  search: string,
  ...fields: Array<string | null | undefined>
): boolean {
  if (search.length === 0) return true;
  const needle = search.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

export interface InboxResult {
  entries: InboxEntry[];
}

/**
 * Inbox (SPEC §2.1): pending intake submissions followed by untriaged issues
 * (open, no status label). Filters apply to the GitHub issues; the search term
 * also matches submission title/body. Submissions are always shown because they
 * carry no repo/status/assignee metadata to filter on.
 */
export function inbox(
  filter: IssueFilter,
  opts: ListOptions = {},
): InboxResult {
  const submissions = listSubmissions().filter((submission) =>
    matchesSearch(filter.search, submission.title, submission.body),
  );

  const untriaged = and(
    eq(mirrorGithubIssue.state, "open"),
    isNull(mirrorGithubIssue.status),
  );
  const base = buildIssueWhere(filter);
  const where = base ? and(untriaged, base) : untriaged;
  const issues = hydrate(rawQuery(where, opts));

  const entries: InboxEntry[] = [
    ...submissions.map(
      (submission): InboxEntry => ({ kind: "submission", submission }),
    ),
    ...issues.map((issue): InboxEntry => ({ kind: "issue", issue })),
  ];
  return { entries };
}

/**
 * Status Board (SPEC §9.3): five open columns by status label plus a Done
 * column of issues closed as completed within `board.done_days`. Canceled
 * issues are omitted. The status filter dimension is ignored here — the columns
 * already partition by status — while every other dimension applies.
 */
export async function statusBoard(
  filter: IssueFilter,
  opts: ListOptions = {},
): Promise<StatusBoard> {
  const { board } = await getConfig();
  const cutoff = Date.now() - board.done_days * DAY_MS;
  const base = buildIssueWhere({ ...filter, statuses: [] });

  const columns: BoardColumn[] = STATUS_VALUES.map((status) => {
    const clause = and(
      eq(mirrorGithubIssue.state, "open"),
      eq(mirrorGithubIssue.status, status),
    );
    const where = base ? and(base, clause) : clause;
    return {
      key: status,
      label: BOARD_LABELS[status],
      issues: hydrate(rawQuery(where, opts)),
    };
  });

  const doneClause = and(
    eq(mirrorGithubIssue.state, "closed"),
    eq(mirrorGithubIssue.stateReason, "completed"),
    gte(mirrorGithubIssue.closedAt, cutoff),
  );
  const doneWhere = base ? and(base, doneClause) : doneClause;
  columns.push({
    key: "done",
    label: BOARD_LABELS.done,
    issues: hydrate(rawQuery(doneWhere, opts)),
  });

  return { columns };
}

/**
 * Option lists for the filter bar and pickers: mirrored repos, users that are
 * assignable in at least one repo (union with anyone currently assigned, so a
 * historical assignee who lost collaborator access stays filterable), and every
 * non-reserved label in use.
 */
export function filterOptions(): FilterOptions {
  const repos = listRepos()
    .map((repo) => ({ id: repo.githubId, slug: `${repo.org}/${repo.name}` }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const assignableRows = db
    .select({
      githubId: mirrorGithubUser.githubId,
      login: mirrorGithubUser.login,
      avatarUrl: mirrorGithubUser.avatarUrl,
    })
    .from(mirrorGithubRepoAssignee)
    .innerJoin(
      mirrorGithubUser,
      eq(mirrorGithubRepoAssignee.userId, mirrorGithubUser.githubId),
    )
    .all();

  const assignedRows = db
    .select({
      githubId: mirrorGithubUser.githubId,
      login: mirrorGithubUser.login,
      avatarUrl: mirrorGithubUser.avatarUrl,
    })
    .from(mirrorGithubIssueAssignee)
    .innerJoin(
      mirrorGithubUser,
      eq(mirrorGithubIssueAssignee.userId, mirrorGithubUser.githubId),
    )
    .all();

  const byId = new Map<number, UserRef>();
  for (const row of [...assignableRows, ...assignedRows]) {
    if (!byId.has(row.githubId)) byId.set(row.githubId, row);
  }
  const assignees = [...byId.values()].sort((a, b) =>
    a.login.localeCompare(b.login),
  );

  const labelRows = db
    .select({ name: mirrorGithubIssueLabel.labelName })
    .from(mirrorGithubIssueLabel)
    .all();
  const labels = [
    ...new Set(
      labelRows
        .map((row) => row.name)
        .filter((name) => !RESERVED_GROUP.has(name.toLowerCase())),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return { repos, assignees, labels };
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
      number: mirrorGithubIssue.number,
      title: mirrorGithubIssue.title,
      state: mirrorGithubIssue.state,
    })
    .from(mirrorGithubIssue)
    .where(eq(mirrorGithubIssue.repoId, repoId))
    .orderBy(desc(mirrorGithubIssue.updatedAt), desc(mirrorGithubIssue.number));

  const rows = opts.limit ? query.limit(opts.limit).all() : query.all();
  return rows as IssueOption[];
}

/** Assignable users for one repo (Inspector picker, SPEC §9.2). */
export function repoAssigneeOptions(repoId: number): UserRef[] {
  return db
    .select({
      githubId: mirrorGithubUser.githubId,
      login: mirrorGithubUser.login,
      avatarUrl: mirrorGithubUser.avatarUrl,
    })
    .from(mirrorGithubRepoAssignee)
    .innerJoin(
      mirrorGithubUser,
      eq(mirrorGithubRepoAssignee.userId, mirrorGithubUser.githubId),
    )
    .where(eq(mirrorGithubRepoAssignee.repoId, repoId))
    .orderBy(asc(mirrorGithubUser.login))
    .all();
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
    .select({ body: mirrorGithubIssue.body })
    .from(mirrorGithubIssue)
    .where(
      and(
        eq(mirrorGithubIssue.repoId, repoId),
        eq(mirrorGithubIssue.number, number),
      ),
    )
    .get();

  const commentRows = db
    .select({
      githubId: mirrorGithubComment.githubId,
      body: mirrorGithubComment.body,
      createdAt: mirrorGithubComment.createdAt,
      authorId: mirrorGithubUser.githubId,
      authorLogin: mirrorGithubUser.login,
      authorAvatar: mirrorGithubUser.avatarUrl,
    })
    .from(mirrorGithubComment)
    .leftJoin(
      mirrorGithubUser,
      eq(mirrorGithubComment.authorId, mirrorGithubUser.githubId),
    )
    .where(
      and(
        eq(mirrorGithubComment.repoId, repoId),
        eq(mirrorGithubComment.issueNumber, number),
      ),
    )
    .orderBy(asc(mirrorGithubComment.createdAt))
    .all();

  const comments: CommentItem[] = commentRows.map((row) => ({
    githubId: row.githubId,
    body: row.body,
    createdAt: row.createdAt,
    author:
      row.authorId !== null && row.authorLogin !== null
        ? {
            githubId: row.authorId,
            login: row.authorLogin,
            avatarUrl: row.authorAvatar ?? "",
          }
        : null,
  }));

  const repoLabels = db
    .select({
      name: mirrorGithubRepoLabel.name,
      color: mirrorGithubRepoLabel.color,
    })
    .from(mirrorGithubRepoLabel)
    .where(eq(mirrorGithubRepoLabel.repoId, repoId))
    .orderBy(asc(mirrorGithubRepoLabel.name))
    .all();

  // Assignable users for the picker, plus the issue's current assignees so
  // checked items always render even if they are no longer collaborators.
  const optionById = new Map<number, UserRef>();
  for (const user of [...repoAssigneeOptions(repoId), ...issue.assignees]) {
    if (!optionById.has(user.githubId)) optionById.set(user.githubId, user);
  }
  const assigneeOptions = [...optionById.values()].sort((a, b) =>
    a.login.localeCompare(b.login),
  );

  return { issue, body: bodyRow?.body ?? "", comments, repoLabels, assigneeOptions };
}
