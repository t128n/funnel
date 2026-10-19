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
// State: instance settings (SPEC §4, §10).
// A normalized key/value store that replaces `funnel.config.yaml`. Keys are
// dotted paths (`sync.history_days`, `intake.default_repo`, ...) and `value`
// holds the JSON-encoded setting. Lists (`repos`, `projects`) live under a
// single key as a JSON array. Reads are validated per key in
// `#lib/server/settings`.
// ---------------------------------------------------------------------------
export const stateSetting = sqliteTable("state_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// State: the GitHub App (SPEC §4, §8).
// A single row (id = 'default') holding the App created through GitHub's App
// Manifest Flow during onboarding. This is the source of truth for the App
// credentials — there are no credential environment variables. Secrets
// (`client_secret`, `webhook_secret`, the RSA `pem`) are encrypted with a key
// derived from FUNNEL_SECRET before they reach this layer (see
// `#lib/server/crypto/secrets`); reads decrypt them.
// ---------------------------------------------------------------------------
export const stateGithubApp = sqliteTable("state_github_app", {
  /** Singleton key; always `default`. */
  id: text("id").primaryKey(),
  appId: integer("app_id").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  ownerLogin: text("owner_login").notNull().default(""),
  /** `User` or `Organization`; used to describe the owner in the UI. */
  ownerType: text("owner_type").notNull().default(""),
  htmlUrl: text("html_url").notNull().default(""),
  /** Public origin captured when the App was created (manifest URLs). */
  baseUrl: text("base_url").notNull().default(""),
  clientId: text("client_id").notNull(),
  clientSecretEnc: text("client_secret_enc").notNull(),
  webhookSecretEnc: text("webhook_secret_enc"),
  privateKeyEnc: text("private_key_enc").notNull(),
  installationId: integer("installation_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// State: internal work notes (ITSM-style journal).
// Funnel-owned and *never* posted to GitHub unless a note is explicitly
// published — and publishing *deletes* the note, turning it into a comment.
// Keyed by `org/name` + issue number rather than a FK to the disposable
// `mirror_github_issue`, so a note survives mirror pruning
// (`sync.history_days`) and a re-sync. The author is snapshotted (id, login,
// avatar) so the note still renders after the mirror user is rebuilt.
// ---------------------------------------------------------------------------
export const stateWorkNote = sqliteTable(
  "state_work_note",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    authorGithubId: integer("author_github_id"),
    authorLogin: text("author_login").notNull().default(""),
    authorAvatarUrl: text("author_avatar_url").notNull().default(""),
    body: text("body").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_state_work_note_issue").on(
      t.org,
      t.name,
      t.issueNumber,
      t.createdAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// State: issue attachments (the "dropbox").
// Metadata for files stored on disk under `FUNNEL_UPLOAD_DIR`; `stored_path` is
// server-generated (`<yyyy>/<mm>/<uuid>`) and never derived from the client's
// filename. Also keyed by `org/name` + issue number so uploads outlive the
// disposable mirror.
// ---------------------------------------------------------------------------
export const stateAttachment = sqliteTable(
  "state_attachment",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    /** Original filename, kept for display and the download disposition. */
    filename: text("filename").notNull(),
    /** Path relative to `FUNNEL_UPLOAD_DIR`, e.g. `2026/10/<uuid>`. */
    storedPath: text("stored_path").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull().default(""),
    uploadedByGithubId: integer("uploaded_by_github_id"),
    uploadedByLogin: text("uploaded_by_login").notNull().default(""),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_state_attachment_issue").on(
      t.org,
      t.name,
      t.issueNumber,
      t.createdAt,
    ),
  ],
);

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
// `role`, `banned`, `banReason`, and `banExpires` are declared by the Better
// Auth admin plugin (see `auth/index.ts`); the plugin owns their semantics.
// `role` is nullable in the plugin schema, but Funnel treats a missing value
// as `read` (see `#lib/server/auth/roles`). The plugin assigns `defaultRole`
// on creation, so in practice only pre-plugin rows are ever null.
export const authUser = sqliteTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  /** `read` | `write` | `admin` (RBAC). Managed via the Better Auth admin plugin. */
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  banReason: text("banReason"),
  banExpires: integer("banExpires", { mode: "timestamp" }),
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
    /** Set by the Better Auth admin plugin while an admin impersonates. */
    impersonatedBy: text("impersonatedBy"),
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
// Mirror: per-repo milestones. GitHub scopes a milestone to exactly one
// repository, so identity is `(repoId, number)`; `githubId` is the global node
// id. Rebuilt by re-sync like the rest of the disposable mirror. Issues point
// at a milestone with `mirror_github_issue.milestone_number` (no FK: the
// milestone set is replaced wholesale on each poll, and an issue may briefly
// reference a number that has not been seen yet).
// ---------------------------------------------------------------------------
export const mirrorGithubMilestone = sqliteTable(
  "mirror_github_milestone",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorGithubRepo.githubId, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** Global node id (GraphQL `databaseId`); 0 when only REST has been seen. */
    githubId: integer("github_id").notNull().default(0),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    /** `open` | `closed`. */
    state: text("state").notNull().default("open"),
    dueOn: integer("due_on"),
    openIssues: integer("open_issues").notNull().default(0),
    closedIssues: integer("closed_issues").notNull().default(0),
    creatorId: integer("creator_id").references(() => mirrorGithubUser.githubId, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    closedAt: integer("closed_at"),
    htmlUrl: text("html_url").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.number] })],
);

// ---------------------------------------------------------------------------
// Mirror: issues (SPEC 6.1). Identity is (repoId, number); githubId is the
// global node id for GraphQL hydration. `status`/`impact`/`urgency`/`size` are
// derived caches of the reserved-label groups (SPEC 5.2) computed at sync time;
// `priority` is the derived P1–P3 cache. Done/Canceled derive from
// (state, stateReason).
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
    /** The issue's milestone number in its own repo (see `mirrorGithubMilestone`). */
    milestoneNumber: integer("milestone_number"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    closedAt: integer("closed_at"),
    status: text("status"),
    /** Triage inputs mirrored from the `sev`/`mod`/`min` impact labels. */
    impact: integer("impact"),
    /** Triage inputs mirrored from the `high`/`mid`/`low` urgency labels. */
    urgency: integer("urgency"),
    /** Derived `P1`–`P3` cache (never a GitHub label). */
    priority: text("priority"),
    size: text("size"),
    blocked: integer("blocked").notNull().default(0),
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
    index("idx_mirror_github_issue_milestone").on(t.repoId, t.milestoneNumber),
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

// Mirror: per-repo assignable users (GitHub `GET /repos/{o}/{r}/assignees`).
// Distinct from `mirror_github_issue_assignee` (who is currently assigned):
// this is the collaborator set the assignee picker offers (SPEC §9.2).
export const mirrorGithubRepoAssignee = sqliteTable(
  "mirror_github_repo_assignee",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorGithubRepo.githubId, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => mirrorGithubUser.githubId, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.userId] })],
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
