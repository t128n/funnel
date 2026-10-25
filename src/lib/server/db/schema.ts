import { desc, sql } from "drizzle-orm";
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
// columns imposed by the library), `mirror_*` is a disposable forge-neutral
// cache (rebuilt by re-sync). Full-text search (FTS5)
// is deferred: text search runs on LIKE queries until the FTS5 index
// (`mirror_thread_fts`) comes back.

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
// Funnel-owned and *never* posted to a forge unless a note is explicitly
// published — and publishing *deletes* the note, turning it into a comment.
// Keyed by `org/name` + thread number rather than a FK to the disposable
// `mirror_thread`, so a note survives mirror pruning
// (`sync.history_days`) and a re-sync. The author is snapshotted (external id,
// login, avatar) so the note still renders after the mirror user is rebuilt.
// ---------------------------------------------------------------------------
export const stateWorkNote = sqliteTable(
  "state_work_note",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    /** Forge-native author id; text because it is opaque across forges. */
    authorExternalId: text("author_external_id"),
    authorForge: text("author_forge").notNull(),
    authorInstance: text("author_instance").notNull(),
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
    uploadedByExternalId: text("uploaded_by_external_id"),
    uploadedByForge: text("uploaded_by_forge").notNull(),
    uploadedByInstance: text("uploaded_by_instance").notNull(),
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
// State: per-user notifications.
// A notification snapshots everything the center renders (title, body, actor,
// url) so rendering never depends on the disposable mirror. `dedupe_key` is
// unique across all users: it names the GitHub event (or intake submission)
// that produced the row, so a re-poll or post-write refresh cannot repeat it.
// Rows are keyed by `auth_user.id`; retention is "until read".
// ---------------------------------------------------------------------------
export const stateNotification = sqliteTable(
  "state_notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** `assigned` | `mentioned` | `comment` | `status` | `priority` | `state` | `new_intake`. */
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    url: text("url").notNull().default(""),
    actorLogin: text("actor_login"),
    actorAvatarUrl: text("actor_avatar_url"),
    createdAt: integer("created_at").notNull(),
    readAt: integer("read_at"),
  },
  (t) => [
    uniqueIndex("uq_state_notification_dedupe").on(t.dedupeKey),
    index("idx_state_notification_user_created").on(t.userId, t.createdAt),
    index("idx_state_notification_user_read").on(t.userId, t.readAt),
  ],
);

// ---------------------------------------------------------------------------
// State: issue watches.
// Keyed by `org/name` + issue number rather than a mirror FK so a watch
// survives mirror pruning and a re-sync. Watchers receive comment and
// status/priority/open-closed notifications (never their own actions).
// ---------------------------------------------------------------------------
export const stateIssueWatch = sqliteTable(
  "state_issue_watch",
  {
    userId: text("user_id").notNull(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.org, t.name, t.issueNumber] }),
    index("idx_state_issue_watch_issue").on(
      t.org,
      t.name,
      t.issueNumber,
    ),
  ],
);

// ---------------------------------------------------------------------------
// State: the planning layer.
// One row schedules one mirrored issue to one ISO Monday week. Keyed by
// `org/name` + issue number rather than a FK to the disposable mirror, so a
// plan item survives mirror pruning and `clearMirror`; GitHub remains
// authoritative for the issue's title, size, assignees, state and milestone.
// `week_start` is the Monday date in `YYYY-MM-DD` form.
// ---------------------------------------------------------------------------
export const statePlanItem = sqliteTable(
  "state_plan_item",
  {
    org: text("org").notNull(),
    name: text("name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    weekStart: text("week_start").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.name, t.issueNumber] }),
    index("idx_state_plan_item_week").on(t.weekStart),
  ],
);

// ---------------------------------------------------------------------------
// State: observed issue transitions (actual-time log).
// Durable append-only events keyed by `org/name` + issue number so they
// survive mirror pruning and a re-sync. `kind` is `status`, `state` or
// `blocked`; `from_value` is null for the baseline rows written on first
// observation. There is no historical backfill from the forge timeline.
// ---------------------------------------------------------------------------
export const stateIssueEvent = sqliteTable(
  "state_issue_event",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    /** `status` | `state` | `blocked`. */
    kind: text("kind").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    at: integer("at").notNull(),
    /** `migration` | `sync`. */
    source: text("source").notNull(),
  },
  (t) => [
    index("idx_state_issue_event_issue_at").on(
      t.org,
      t.name,
      t.issueNumber,
      t.at,
    ),
  ],
);

// ---------------------------------------------------------------------------
// State: issue delay intervals (blocked and manual).
// `source = "blocked"` rows follow the issue's blocked flag automatically;
// `source = "manual"` rows are created in the Inspector. Active intervals
// have a null `ended_at`. Total delay time is the union of intervals, so an
// automatic and a manual delay may overlap and count once.
// ---------------------------------------------------------------------------
export const stateIssueDelay = sqliteTable(
  "state_issue_delay",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    /** `dependency` | `info` | `review` | `external` | `capacity` | `other`. */
    reason: text("reason").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    note: text("note").notNull().default(""),
    /** `blocked` | `manual`. */
    source: text("source").notNull(),
  },
  (t) => [
    index("idx_state_issue_delay_issue_started").on(
      t.org,
      t.name,
      t.issueNumber,
      t.startedAt,
    ),
    index("idx_state_issue_delay_ended").on(t.endedAt),
  ],
);

// ---------------------------------------------------------------------------
// State: ALPEN day planning (SPEC §3).
//
// All four tables are per-viewer durable state keyed by `auth_user.id` with
// `ON DELETE CASCADE`. They never reference the disposable mirror: an issue is
// identified by `org/name` + issue number, exactly like `state_plan_item`.
// Minutes are integers from local midnight (`0..1440`); dates are
// `YYYY-MM-DD`.
// ---------------------------------------------------------------------------

/** Per-viewer working hours. Absent row = the admin `planning.work_defaults`. */
export const stateWorkHours = sqliteTable("state_work_hours", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUser.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  /** ISO weekdays, Monday 1 … Sunday 7. */
  workDays: text("work_days", { mode: "json" })
    .$type<number[]>()
    .notNull(),
  bufferPercent: integer("buffer_percent").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * One recurring (`weekday`) or one-off (`date`) blocked window. Exactly one of
 * the two is set; the API validates that before writing.
 */
export const stateUnavailableWindow = sqliteTable(
  "state_unavailable_window",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** ISO weekday 1–7 for a recurring window, else null. */
    weekday: integer("weekday"),
    /** `YYYY-MM-DD` for a one-off window, else null. */
    date: text("date"),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_state_unavailable_window_user").on(t.userId)],
);

/** One timed block on one local day. `issue` rows carry a ref; buffer rows do not. */
export const stateDayBlock = sqliteTable(
  "state_day_block",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    startMinute: integer("start_minute").notNull(),
    minutes: integer("minutes").notNull(),
    /** `issue` | `buffer`. */
    kind: text("kind").notNull(),
    org: text("org"),
    name: text("name"),
    issueNumber: integer("issue_number"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_state_day_block_user_date").on(t.userId, t.date)],
);

/**
 * The tokenized read-only ICS feed. Only the SHA-256 hex hash and the first 8
 * characters of the token are stored: the raw secret is shown once, and
 * rotating replaces the row so the previous URL stops resolving.
 */
export const stateCalendarFeed = sqliteTable("state_calendar_feed", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUser.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  tokenHint: text("token_hint").notNull(),
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
// Mirror: repositories (SPEC 5.1, 6.2). The forge-native numeric id lives in
// `external_id` (text: opaque across forges); `(forge, instance, external_id)`
// is the identity and the internal `id` is the only FK target. `etag` persists
// REST change detection across restarts (304s are free).
// ---------------------------------------------------------------------------
export const mirrorRepo = sqliteTable(
  "mirror_repo",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    forge: text("forge").notNull(),
    instance: text("instance").notNull(),
    externalId: text("external_id").notNull(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull().default(""),
    etag: text("etag"),
    archived: integer("archived").notNull().default(0),
    degraded: integer("degraded").notNull().default(0),
    lastPolledAt: integer("last_polled_at"),
    lastReconciledAt: integer("last_reconciled_at"),
  },
  (t) => [
    uniqueIndex("uq_mirror_repo_external").on(
      t.forge,
      t.instance,
      t.externalId,
    ),
    uniqueIndex("uq_mirror_repo_slug").on(t.forge, t.instance, t.org, t.name),
  ],
);

// Mirror: forge people (SPEC 6.1). Authors and assignees reference this by the
// internal `id`; `(forge, instance, external_id)` is the forge-native identity.
export const mirrorUser = sqliteTable(
  "mirror_user",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    forge: text("forge").notNull(),
    instance: text("instance").notNull(),
    externalId: text("external_id").notNull(),
    login: text("login").notNull(),
    avatarUrl: text("avatar_url").notNull().default(""),
    url: text("url").notNull().default(""),
  },
  (t) => [
    uniqueIndex("uq_mirror_user_external").on(
      t.forge,
      t.instance,
      t.externalId,
    ),
    uniqueIndex("uq_mirror_user_login").on(t.forge, t.instance, t.login),
    // Login lookups are case-insensitive (`COLLATE NOCASE`); this index lets
    // SQLite seek them instead of scanning `mirror_user`.
    index("idx_mirror_user_login_nocase").on(sql`${t.login} COLLATE NOCASE`),
  ],
);

// ---------------------------------------------------------------------------
// Mirror: per-repo milestones. A milestone is scoped to exactly one
// repository, so identity is `(repoId, number)`; `externalId` is the forge's
// global id (GraphQL `databaseId`). Rebuilt by re-sync like the rest of the
// disposable mirror. Threads point at a milestone with
// `mirror_thread.milestone_number` (no FK: the milestone set is replaced
// wholesale on each poll, and a thread may briefly reference a number that has
// not been seen yet).
// ---------------------------------------------------------------------------
export const mirrorMilestone = sqliteTable(
  "mirror_milestone",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorRepo.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** Forge-native global id; empty when only the REST number has been seen. */
    externalId: text("external_id").notNull().default(""),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    /** `open` | `closed`. */
    state: text("state").notNull().default("open"),
    dueOn: integer("due_on"),
    openIssues: integer("open_issues").notNull().default(0),
    closedIssues: integer("closed_issues").notNull().default(0),
    creatorId: integer("creator_id").references(() => mirrorUser.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    closedAt: integer("closed_at"),
    url: text("url").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.number] })],
);

// ---------------------------------------------------------------------------
// Mirror: threads (SPEC 6.1). A "thread" is a federated issue/PR; this slice
// only syncs `kind = 'issue'` but the column keeps the door open. Identity is
// `(repoId, number)`; `externalId` is the forge's global id for GraphQL
// hydration. `status`/`impact`/`urgency`/`size` are derived caches of the
// reserved label groups (SPEC 5.2) computed at sync time; `priority` is the
// derived P1–P3 cache. Done/Canceled derive from (state, stateReason).
// Composite FKs from junction tables are enforced in code (delete children
// first); single-column references below use FK cascades.
// ---------------------------------------------------------------------------
export const mirrorThread = sqliteTable(
  "mirror_thread",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorRepo.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** Forge-native global id (`databaseId` as text). */
    externalId: text("external_id").notNull(),
    /** `issue` (a pull request would be `pull_request`). */
    kind: text("kind").notNull().default("issue"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    state: text("state").notNull(),
    stateReason: text("state_reason"),
    authorId: integer("author_id").references(() => mirrorUser.id, {
      onDelete: "set null",
    }),
    /** The thread's milestone number in its own repo (see `mirrorMilestone`). */
    milestoneNumber: integer("milestone_number"),
    url: text("url").notNull().default(""),
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
    /**
     * Sortable rank of {@link priority}: P1 = 0, P2 = 1, P3 = 2, unprioritized
     * = 3. Persisted so lists and cursors can order on an indexed column
     * instead of evaluating a CASE expression per row.
     */
    priorityRank: integer("priority_rank").notNull().default(3),
    size: text("size"),
    blocked: integer("blocked").notNull().default(0),
    /** Derived cache of the `epic` label; children live in the issue body. */
    isEpic: integer("is_epic").notNull().default(0),
    labelConflict: integer("label_conflict").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.number] }),
    uniqueIndex("uq_mirror_thread_external").on(t.repoId, t.externalId),
    index("idx_mirror_thread_status_updated").on(t.status, t.updatedAt),
    index("idx_mirror_thread_priority_updated").on(t.priority, t.updatedAt),
    index("idx_mirror_thread_priority_rank_updated").on(
      t.priorityRank,
      desc(t.updatedAt),
    ),
    index("idx_mirror_thread_blocked_state").on(t.blocked, t.state),
    index("idx_mirror_thread_state").on(t.state, t.stateReason),
    index("idx_mirror_thread_repo_updated").on(t.repoId, t.updatedAt),
    index("idx_mirror_thread_milestone").on(t.repoId, t.milestoneNumber),
  ],
);

// Mirror: per-repo label set (SPEC 6.1) + thread label assignments.
export const mirrorRepoLabel = sqliteTable(
  "mirror_repo_label",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorRepo.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default(""),
    description: text("description").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.name] })],
);

export const mirrorThreadLabel = sqliteTable(
  "mirror_thread_label",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorRepo.id, { onDelete: "cascade" }),
    threadNumber: integer("thread_number").notNull(),
    labelName: text("label_name").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.threadNumber, t.labelName] }),
    index("idx_mirror_thread_label_name").on(t.labelName),
  ],
);

// Mirror: thread assignees (SPEC 5.4). "Assigned to me" = row exists.
export const mirrorThreadAssignee = sqliteTable(
  "mirror_thread_assignee",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorRepo.id, { onDelete: "cascade" }),
    threadNumber: integer("thread_number").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => mirrorUser.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.repoId, t.threadNumber, t.userId] }),
    index("idx_mirror_thread_assignee_user").on(t.userId),
  ],
);

// Mirror: per-repo assignable users (forge `GET /repos/{o}/{r}/assignees`).
// Distinct from `mirror_thread_assignee` (who is currently assigned): this is
// the collaborator set the assignee picker offers (SPEC §9.2).
export const mirrorRepoAssignee = sqliteTable(
  "mirror_repo_assignee",
  {
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorRepo.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => mirrorUser.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.repoId, t.userId] })],
);

// Mirror: thread comments (SPEC 6.1). `(repoId, externalId)` is the forge
// identity; the internal `id` is what the UI links to.
export const mirrorComment = sqliteTable(
  "mirror_comment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repoId: integer("repo_id")
      .notNull()
      .references(() => mirrorRepo.id, { onDelete: "cascade" }),
    threadNumber: integer("thread_number").notNull(),
    externalId: text("external_id").notNull(),
    authorId: integer("author_id").references(() => mirrorUser.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_mirror_comment_external").on(t.repoId, t.externalId),
    index("idx_mirror_comment_thread").on(t.repoId, t.threadNumber),
  ],
);
