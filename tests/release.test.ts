import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  MIGRATIONS_DIR_ENV,
  appliedMigrationCount,
  countMigrations,
  findMigrationsFolder,
  isMigrationsFolder,
  resolveMigrationsFolder,
  runMigrations,
} from "#lib/server/db/release";

const ROOT = resolve(import.meta.dir, "..");
const DRIZZLE = join(ROOT, "drizzle");
const COMMITTED = countMigrations(DRIZZLE);

const cleanup: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

function writeMigration(
  folder: string,
  name: string,
  sql = "CREATE TABLE IF NOT EXISTS migration_marker (id INTEGER);",
): void {
  const dir = join(folder, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "migration.sql"), sql);
}

function withEnv<T>(name: string, value: string | undefined, fn: () => T): T {
  const previous = process.env[name];
  try {
    process.env[name] = value;
    return fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

afterEach(() => {
  for (const path of cleanup.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("isMigrationsFolder / countMigrations", () => {
  test("detects timestamped directories containing migration.sql", () => {
    const folder = tempDir("funnel-migration-shape-");

    expect(isMigrationsFolder(folder)).toBe(false);
    expect(countMigrations(folder)).toBe(0);

    writeMigration(folder, "20260101000000_first");
    expect(isMigrationsFolder(folder)).toBe(true);
    expect(countMigrations(folder)).toBe(1);

    writeMigration(folder, "20260102000000_second");
    expect(countMigrations(folder)).toBe(2);
  });

  test("returns false/zero for missing paths and files", () => {
    const root = tempDir("funnel-migration-missing-");
    const missing = join(root, "does-not-exist");

    expect(isMigrationsFolder(missing)).toBe(false);
    expect(countMigrations(missing)).toBe(0);

    const file = join(root, "not-a-folder");
    writeFileSync(file, "not a directory");
    expect(isMigrationsFolder(file)).toBe(false);
    expect(countMigrations(file)).toBe(0);
  });

  test("ignores directories without migration.sql", () => {
    const folder = tempDir("funnel-migration-empty-");
    mkdirSync(join(folder, "20260101000000_empty"), { recursive: true });
    writeFileSync(
      join(folder, "20260101000000_empty", "snapshot.json"),
      "{}",
    );
    writeFileSync(join(folder, "stray.txt"), "");

    expect(isMigrationsFolder(folder)).toBe(false);
    expect(countMigrations(folder)).toBe(0);
  });
});

describe("findMigrationsFolder", () => {
  test("probes embedded, cwd, and checkout layouts in order", () => {
    const root = tempDir("funnel-migration-layouts-");
    const embedded = join(root, "app", "drizzle");
    const cwdLayout = join(root, "deploy", "drizzle");
    const checkout = join(root, "repo", "drizzle");
    writeMigration(embedded, "20260101000000_embedded");
    writeMigration(cwdLayout, "20260101000000_cwd");
    writeMigration(checkout, "20260101000000_checkout");

    expect(
      findMigrationsFolder([embedded, cwdLayout, checkout], root),
    ).toBe(embedded);

    rmSync(embedded, { recursive: true, force: true });
    expect(
      findMigrationsFolder([embedded, cwdLayout, checkout], root),
    ).toBe(cwdLayout);

    rmSync(cwdLayout, { recursive: true, force: true });
    expect(
      findMigrationsFolder([embedded, cwdLayout, checkout], root),
    ).toBe(checkout);
  });

  test("resolves relative candidates against cwd", () => {
    const root = tempDir("funnel-migration-relative-");
    writeMigration(join(root, "drizzle"), "20260101000000_relative");

    expect(findMigrationsFolder(["drizzle"], root)).toBe(join(root, "drizzle"));
    expect(findMigrationsFolder(["./drizzle"], root)).toBe(
      join(root, "drizzle"),
    );
  });

  test("skips blank and undefined candidates", () => {
    const root = tempDir("funnel-migration-blank-");
    writeMigration(join(root, "drizzle"), "20260101000000_blank");

    expect(findMigrationsFolder([undefined, "", "   ", "drizzle"], root)).toBe(
      join(root, "drizzle"),
    );
  });

  test("throws an error naming the env var and every candidate", () => {
    const root = tempDir("funnel-migration-not-found-");
    const missing = join(root, "missing");

    let error: Error | undefined;
    try {
      findMigrationsFolder(["first", missing], root);
    } catch (caught) {
      error = caught as Error;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain(MIGRATIONS_DIR_ENV);
    expect(error?.message).toContain("first");
    expect(error?.message).toContain(missing);
    expect(error?.message).toContain("<timestamp>_*/migration.sql");
  });
});

describe("resolveMigrationsFolder", () => {
  test("prefers an absolute FUNNEL_MIGRATIONS_DIR override", () => {
    const folder = join(tempDir("funnel-migration-env-"), "migrations");
    writeMigration(folder, "20260101000000_env");

    withEnv(MIGRATIONS_DIR_ENV, folder, () => {
      expect(resolveMigrationsFolder()).toBe(folder);
    });
  });

  test("resolves a relative FUNNEL_MIGRATIONS_DIR override against cwd", () => {
    const folder = join(tempDir("funnel-migration-env-relative-"), "migrations");
    writeMigration(folder, "20260101000000_env_relative");
    const candidate = relative(process.cwd(), folder);

    withEnv(MIGRATIONS_DIR_ENV, candidate, () => {
      expect(resolveMigrationsFolder()).toBe(resolve(process.cwd(), candidate));
    });
  });

  test("falls back to the committed drizzle/ folder in the checkout", () => {
    withEnv(MIGRATIONS_DIR_ENV, undefined, () => {
      expect(resolve(resolveMigrationsFolder())).toBe(resolve(DRIZZLE));
    });
  });
});

describe("runMigrations", () => {
  test("applies the committed migrations to a fresh database", () => {
    const dbPath = join(tempDir("funnel-release-fresh-"), "funnel.db");
    expect(existsSync(dbPath)).toBe(false);

    const report = runMigrations({ dbPath, migrationsFolder: DRIZZLE });

    expect(report.dbPath).toBe(dbPath);
    expect(report.migrationsFolder).toBe(DRIZZLE);
    expect(report.before).toBeNull();
    expect(report.after).toBe(COMMITTED);
    expect(report.applied).toBe(COMMITTED);

    const sqlite = new Database(dbPath);
    try {
      expect(appliedMigrationCount(sqlite)).toBe(COMMITTED);
      const table = sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_user'",
        )
        .get() as { name: string } | null;
      expect(table?.name).toBe("auth_user");
    } finally {
      sqlite.close();
    }
  });

  test("is idempotent and closes its connection", () => {
    const dir = tempDir("funnel-release-repeat-");
    const dbPath = join(dir, "funnel.db");
    const options = { dbPath, migrationsFolder: DRIZZLE };

    const first = runMigrations(options);
    const second = runMigrations(options);

    expect(first.applied).toBe(COMMITTED);
    expect(second.before).toBe(first.after);
    expect(second.after).toBe(first.after);
    expect(second.applied).toBe(0);

    // A clean close checkpoints and removes the WAL sidecars; a leaked
    // connection would leave them behind.
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });

  test("sets WAL, busy_timeout, and foreign keys on its connection", () => {
    const dbPath = join(tempDir("funnel-release-pragmas-"), "funnel.db");
    const runSpy = spyOn(Database.prototype, "run");
    let statements: string[];
    try {
      runMigrations({ dbPath, migrationsFolder: DRIZZLE });
      statements = runSpy.mock.calls.map((call) => String(call[0]));
    } finally {
      runSpy.mockRestore();
    }
    expect(statements).toContain("PRAGMA journal_mode = WAL;");
    expect(statements).toContain("PRAGMA busy_timeout = 5000;");
    expect(statements).toContain("PRAGMA foreign_keys = ON;");

    // WAL is persisted in the database file, so it survives the close.
    const sqlite = new Database(dbPath);
    try {
      const mode = sqlite
        .query("PRAGMA journal_mode;")
        .get() as { journal_mode: string } | null;
      expect(mode?.journal_mode).toBe("wal");
    } finally {
      sqlite.close();
    }
  });

  test("migrates an in-memory database", () => {
    const report = runMigrations({
      dbPath: ":memory:",
      migrationsFolder: DRIZZLE,
    });

    expect(report.dbPath).toBe(":memory:");
    expect(report.before).toBeNull();
    expect(report.after).toBe(COMMITTED);
    expect(report.applied).toBe(COMMITTED);
  });
});

describe("bun run release", () => {
  test("applies migrations to a temp database without ambient state", () => {
    const dbPath = join(tempDir("funnel-release-cli-"), "funnel.db");
    const result = spawnSync(process.execPath, ["scripts/release.ts"], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME ?? tmpdir(),
        FUNNEL_DB: dbPath,
        FUNNEL_MIGRATIONS_DIR: DRIZZLE,
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      `[release] ${COMMITTED} migration(s) applied`,
    );
    expect(result.stdout).toContain(`db=${dbPath}`);
    expect(result.stdout).toContain(`migrations=${DRIZZLE}`);
    expect(result.stdout).toContain(`total=${COMMITTED}`);

    const sqlite = new Database(dbPath);
    try {
      expect(appliedMigrationCount(sqlite)).toBe(COMMITTED);
    } finally {
      sqlite.close();
    }
  });
});
