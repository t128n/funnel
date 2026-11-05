import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "#lib/server/db/index";
const cols = (table: string) =>
  db.$client
    .query(`pragma table_info(${table})`)
    .all()
    .map((r: any) => r.name);
test("the mirror is forge-neutral", () => {
  const repo = cols("mirror_repo");
  expect(repo).toContain("forge");
  expect(repo).toContain("instance");
  expect(repo).toContain("external_id");
  expect(repo).not.toContain("github_id");
  const thread = cols("mirror_thread");
  expect(thread).toContain("kind");
  expect(thread).toContain("external_id");
  expect(thread).toContain("url");
  expect(cols("mirror_github_repo")).toEqual([]);
});
test("durable state keeps external authors", () => {
  expect(cols("state_work_note")).toContain("author_external_id");
  expect(cols("state_work_note")).not.toContain("author_github_id");
  expect(cols("state_attachment")).toContain("uploaded_by_external_id");
});

test("test_intake_archive_columns", () => {
  expect(cols("state_intake_submission")).toEqual(
    expect.arrayContaining([
      "archived_at",
      "dismiss_reason",
      "duplicate_repo",
      "duplicate_number",
    ]),
  );
});

test("test_snooze_columns", () => {
  expect(cols("state_snooze")).toEqual(
    expect.arrayContaining([
      "key",
      "submission_id",
      "repo",
      "number",
      "snoozed_until",
      "created_at",
      "actor_user_id",
    ]),
  );
});

test("test_saved_view_columns", () => {
  expect(cols("state_saved_view")).toEqual(
    expect.arrayContaining([
      "id",
      "owner_user_id",
      "name",
      "query",
      "scope",
      "sort",
      "direction",
      "group",
      "shared",
      "pinned",
      "created_at",
      "updated_at",
    ]),
  );
  const indexes = db.$client
    .query("pragma index_list(state_saved_view)")
    .all() as Array<{ name: string; unique: number }>;
  expect(
    indexes.some(
      (index) =>
        index.name === "uq_state_saved_view_owner_name" && index.unique === 1,
    ),
  ).toBe(true);
});

test("test_triage_event_columns", () => {
  expect(cols("state_triage_event")).toEqual(
    expect.arrayContaining([
      "submission_id",
      "action",
      "actor_user_id",
      "repo",
      "number",
      "reason",
      "created_at",
    ]),
  );
});

test("test_event_columns", () => {
  expect(cols("state_issue_event")).toEqual(
    expect.arrayContaining([
      "org",
      "name",
      "issue_number",
      "kind",
      "from_value",
      "to_value",
      "at",
      "source",
    ]),
  );
});

test("test_delay_columns", () => {
  expect(cols("state_issue_delay")).toEqual(
    expect.arrayContaining([
      "reason",
      "started_at",
      "ended_at",
      "note",
      "source",
    ]),
  );
});

test("test_mirror_is_epic_default_zero", () => {
  const info = db.$client
    .query("pragma table_info(mirror_thread)")
    .all() as any[];
  const isEpic = info.find((c) => c.name === "is_epic");
  expect(isEpic).toBeDefined();
  expect(String(isEpic.dflt_value)).toBe("0");
  expect(isEpic.notnull).toBe(1);
});

test("test_baseline_seed", () => {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON;");
  const fresh = drizzle({ client: sqlite });
  migrate(fresh, {
    migrationsFolder: fileURLToPath(
      new URL("../../../../drizzle", import.meta.url),
    ),
  });

  sqlite.run(
    `INSERT INTO mirror_repo (forge, instance, external_id, org, name)
     VALUES ('github', '', 'seed-1', 'seedorg', 'seedrepo')`,
  );
  const repoId = (
    sqlite
      .query("SELECT id FROM mirror_repo WHERE org = 'seedorg'")
      .get() as any
  ).id;
  const insertThread = sqlite.query(
    `INSERT INTO mirror_thread
       (repo_id, number, external_id, kind, title, state, status, blocked, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
  );
  insertThread.run(repoId, 1, "seed-open", "issue", "Open", "open", "in-progress", 0);
  insertThread.run(repoId, 2, "seed-blocked", "issue", "Blocked", "open", "backlog", 1);
  insertThread.run(
    repoId,
    3,
    "seed-closed-blocked",
    "issue",
    "Closed blocked",
    "closed",
    "backlog",
    1,
  );
  insertThread.run(
    repoId,
    4,
    "seed-pull-request",
    "pull_request",
    "A PR",
    "open",
    "in-progress",
    1,
  );

  // Replay the baseline seed statements from the additive migration against
  // rows that already existed, as they would at deploy time.
  const migration = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../drizzle/20261024170000_actuals_epics/migration.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (/INSERT INTO `state_issue_(event|delay)`/.test(statement)) {
      sqlite.run(statement);
    }
  }

  const events = sqlite
    .query(
      `SELECT kind, from_value, to_value, at, source
       FROM state_issue_event WHERE org = 'seedorg' AND issue_number = 1
       ORDER BY kind`,
    )
    .all() as any[];
  expect(events).toHaveLength(3);
  expect(events.map((e) => e.kind)).toEqual(["blocked", "state", "status"]);
  for (const event of events) {
    expect(event.from_value).toBeNull();
    expect(event.source).toBe("migration");
    expect(event.at).toBeGreaterThan(0);
  }
  expect(events.find((e) => e.kind === "state")!.to_value).toBe("open");
  expect(events.find((e) => e.kind === "status")!.to_value).toBe("in-progress");
  expect(events.find((e) => e.kind === "blocked")!.to_value).toBe("false");

  const delays = sqlite
    .query(
      `SELECT reason, started_at, ended_at, note, source
       FROM state_issue_delay WHERE org = 'seedorg' AND issue_number = 2`,
    )
    .all() as any[];
  expect(delays).toHaveLength(1);
  expect(delays[0].reason).toBe("other");
  expect(delays[0].ended_at).toBeNull();
  expect(delays[0].source).toBe("blocked");
  expect(delays[0].started_at).toBeGreaterThan(0);
  // A blocked issue that is already closed must not keep an open delay: nothing
  // would ever close it, so it would accrue delay minutes forever.
  const closedDelay = sqlite
    .query(
      `SELECT started_at, ended_at FROM state_issue_delay
       WHERE org = 'seedorg' AND issue_number = 3`,
    )
    .get() as any;
  expect(closedDelay).not.toBeNull();
  expect(closedDelay.ended_at).toBe(closedDelay.started_at);
  // Only issues get baselines; a mirrored PR thread does not.
  expect(
    sqlite
      .query(
        "SELECT COUNT(*) AS n FROM state_issue_event WHERE issue_number = 4",
      )
      .get(),
  ).toEqual({ n: 0 });
  expect(
    sqlite
      .query(
        "SELECT COUNT(*) AS n FROM state_issue_delay WHERE issue_number = 4",
      )
      .get(),
  ).toEqual({ n: 0 });
  expect(
    sqlite
      .query(
        "SELECT COUNT(*) AS n FROM state_issue_delay WHERE issue_number = 1",
      )
      .get(),
  ).toEqual({ n: 0 });
});
