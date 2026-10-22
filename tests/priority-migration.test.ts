import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const DRIZZLE = fileURLToPath(new URL("../drizzle", import.meta.url));
const migrations = readdirSync(DRIZZLE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

/**
 * Upgrade from the merged local-state model: the latest migration adds the
 * label-driven impact/urgency/priority columns and drops the old state table.
 */
describe("priority label migration", () => {
  test("adds the axis columns and drops the local state table", () => {
    const prior = mkdtempSync(join(tmpdir(), "funnel-prior-"));
    const dbPath = join(tmpdir(), `funnel-migrate-${process.pid}-${Date.now()}.db`);
    cleanup.push(prior, dbPath);

    for (const name of migrations.slice(0, -1)) {
      cpSync(join(DRIZZLE, name), join(prior, name), { recursive: true });
    }

    const sqlite = new Database(dbPath, { create: true });
    try {
      sqlite.run("PRAGMA foreign_keys = ON");
      migrate(drizzle({ client: sqlite }), { migrationsFolder: prior });

      sqlite
        .query(
          `INSERT INTO mirror_github_repo
             (github_id, org, name, archived, degraded)
           VALUES (1, 'orgA', 'core', 0, 0)`,
        )
        .run();
      sqlite
        .query(
          `INSERT INTO mirror_github_issue
             (repo_id, number, github_id, title, body, state, created_at, updated_at)
           VALUES (1, 7, 700, 'issue', '', 'open', 1, 1)`,
        )
        .run();
      migrate(drizzle({ client: sqlite }), { migrationsFolder: DRIZZLE });

      const columns = sqlite
        .query("PRAGMA table_info(mirror_thread)")
        .all()
        .map((column) => (column as { name: string }).name);
      expect(columns).toEqual(
        expect.arrayContaining(["impact", "urgency", "priority"]),
      );

      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((table) => (table as { name: string }).name);
      expect(tables).not.toContain("state_issue_priority");
      expect(tables).not.toContain("mirror_github_issue");

      const threads = sqlite.query("SELECT count(*) AS n FROM mirror_thread").get() as { n: number };
      expect(threads.n).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});
