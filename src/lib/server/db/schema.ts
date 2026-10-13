import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Single `funnel.db`. Timestamps are INTEGER unix milliseconds.
//
// Table naming: `state_*` is Funnel-owned durable state (backup, never
// truncated), `auth_*` is Better Auth-owned durable state (camelCase
// columns imposed by the library), `mirror_github_*` is disposable GitHub
// cache (rebuilt by re-sync). Full-text search (FTS5)
// is deferred: text search runs on LIKE queries until the FTS5 index
// (`mirror_github_issue_fts`) comes back.

// ---------------------------------------------------------------------------
// State: public intake submissions (SPEC 7, 10.1).
// A triage decision deletes the row. Nothing is kept afterwards.
// ---------------------------------------------------------------------------
export const stateIntakeSubmission = sqliteTable("state_intake_submission", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  source: text("source"),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Auth: Better Auth tables (SPEC 7, 8). Field names match Better Auth's
// stock schema. Date columns use timestamp mode and `emailVerified`
// boolean mode: the drizzle adapter passes Date/boolean objects, and
// plain integer columns cannot bind them. Tokens stored here must be
// encrypted at rest with a key derived from FUNNEL_SECRET before they
// reach this layer if Better Auth cannot do it natively.
// Table names are `auth_*`; the adapter is given the explicit mapping in
// `auth/index.ts` (`user: authUser`, ...).
// ---------------------------------------------------------------------------
export const authUser = sqliteTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const authSession = sqliteTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (t) => [index("idx_auth_session_user").on(t.userId)],
);

export const authAccount = sqliteTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: integer("accessTokenExpiresAt", {
      mode: "timestamp",
    }),
    refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
      mode: "timestamp",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_auth_account_user").on(t.userId)],
);

export const authVerification = sqliteTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// Mirror: repos (SPEC 5.1, 6.2). Numeric GitHub id survives renames.
// `etag` persists REST change detection across restarts (304s are free).
// ---------------------------------------------------------------------------
export const mirrorGithubRepo = sqliteTable(
  "mirror_github_repo",
  {
    githubId: integer("github_id").primaryKey(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    etag: text("etag"),
    archived: integer("archived").notNull().default(0),
    degraded: integer("degraded").notNull().default(0),
    lastPolledAt: integer("last_polled_at"),
    lastReconciledAt: integer("last_reconciled_at"),
  },
  (t) => [uniqueIndex("uq_mirror_github_repo_org_name").on(t.org, t.name)],
);

// Mirror: GitHub people (SPEC 6.1). Authors and assignees reference this.
export const mirrorGithubUser = sqliteTable("mirror_github_user", {
  githubId: integer("github_id").primaryKey(),
  login: text("login").notNull().unique(),
  avatarUrl: text("avatar_url").notNull().default(""),
});

// ---------------------------------------------------------------------------
// Mirror: issues (SPEC 6.1). Identity is (repoId, number); githubId is the
// global node id for GraphQL hydration. `status`/`priority`/`size` are
// derived caches of the reserved-label groups (SPEC 5.2) computed at sync
// time. Done/Canceled derive from (state, stateReason).
// Composite FKs from junction tables are enforced in code (delete children
// first); single-column references below use FK cascades.
// ---------------------------------------------------------------------------
export const mirrorGithubIssue = sqliteTable(
  "mirror_github_issue",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorGithubRepo.githubId, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    githubId: integer("github_id").notNull().unique(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    state: text("state").notNull(),
    stateReason: text("state_reason"),
    authorId: integer("author_id").references(() => mirrorGithubUser.githubId, {
      onDelete: "set null",
    }),
    milestoneName: text("milestone_name"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    closedAt: integer("closed_at"),
    status: text("status"),
    priority: text("priority"),
    size: text("size"),
    labelConflict: integer("label_conflict").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.number] }),
    index("idx_mirror_github_issue_status_updated").on(t.status, t.updatedAt),
    index("idx_mirror_github_issue_priority_updated").on(
      t.priority,
      t.updatedAt,
    ),
    index("idx_mirror_github_issue_state").on(t.state, t.stateReason),
    index("idx_mirror_github_issue_repo_updated").on(t.repoId, t.updatedAt),
  ],
);

// Mirror: per-repo label set (SPEC 6.1) + issue label assignments.
export const mirrorGithubRepoLabel = sqliteTable(
  "mirror_github_repo_label",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorGithubRepo.githubId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default(""),
    description: text("description").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.name] })],
);

export const mirrorGithubIssueLabel = sqliteTable(
  "mirror_github_issue_label",
  {
    repoId: integer("repo_id").notNull(),
    issueNumber: integer("issue_number").notNull(),
    labelName: text("label_name").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.issueNumber, t.labelName] }),
    index("idx_mirror_github_issue_label_name").on(t.labelName),
  ],
);

// Mirror: assignees (SPEC 5.4). "Assigned to me" = row exists.
export const mirrorGithubIssueAssignee = sqliteTable(
  "mirror_github_issue_assignee",
  {
    repoId: integer("repo_id").notNull(),
    issueNumber: integer("issue_number").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => mirrorGithubUser.githubId, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.issueNumber, t.userId] }),
    index("idx_mirror_github_issue_assignee_user").on(t.userId),
  ],
);

// Mirror: issue comments (SPEC 6.1).
export const mirrorGithubComment = sqliteTable(
  "mirror_github_comment",
  {
    githubId: integer("github_id").primaryKey(),
    repoId: integer("repo_id").notNull(),
    issueNumber: integer("issue_number").notNull(),
    authorId: integer("author_id").references(() => mirrorGithubUser.githubId, {
      onDelete: "set null",
    }),
    body: text("body").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_mirror_github_comment_issue").on(t.repoId, t.issueNumber)],
);
