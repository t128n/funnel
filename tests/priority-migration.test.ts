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
 * The upgrade path matters more than a fresh install: an existing database
 * still has `mirror_github_issue.priority`, and the migration must seed the
 * durable rows before dropping the column.
 */
describe("priority migration", () => {
  test("seeds P1-P3 from the mirrored label cache, then drops the column", () => {
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
      const insert = sqlite.query(
        `INSERT INTO mirror_github_issue
           (repo_id, number, github_id, title, body, state, created_at, updated_at, priority)
         VALUES (1, ?, ?, 'issue', '', 'open', 1, 1, ?)`,
      );
      insert.run(1, 101, "p1");
      insert.run(2, 102, "p2");
      insert.run(3, 103, "p3");
      insert.run(4, 104, null);

      migrate(drizzle({ client: sqlite }), { migrationsFolder: DRIZZLE });

      const rows = sqlite
        .query(
          `SELECT issue_number, impact, urgency, priority
             FROM state_issue_priority
            ORDER BY issue_number`,
        )
        .all();
      expect(rows).toEqual([
        { issue_number: 1, impact: null, urgency: null, priority: "P1" },
        { issue_number: 2, impact: null, urgency: null, priority: "P2" },
        { issue_number: 3, impact: null, urgency: null, priority: "P3" },
      ]);

      const columns = sqlite
        .query("PRAGMA table_info(mirror_github_issue)")
        .all()
        .map((column) => (column as { name: string }).name);
      expect(columns).not.toContain("priority");
    } finally {
      sqlite.close();
    }
  });
});
