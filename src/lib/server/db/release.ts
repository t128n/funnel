/**
 * Release-step migrations (the 12-factor "admin process").
 *
 * `bun run release` applies the committed Drizzle migrations in `drizzle/` to
 * the target database. The packaged executable calls the same function on boot,
 * since a bare-metal install has no separate release phase.
 *
 * It deliberately does **not** import the application env (`$app/env/private`)
 * or the app's `db` singleton: the release step has to run before the server
 * boots and without the deploy secrets being present. It opens its own
 * `bun:sqlite` connection and closes it again.
 *
 * The database path comes from `FUNNEL_DB` (default `./data/funnel.db`); the
 * migrations folder from `FUNNEL_MIGRATIONS_DIR`, else a set of candidates that
 * covers a repo checkout, an adapter-node deploy, and a compiled executable
 * (where `drizzle/` is embedded next to the binary).
 *
 * drizzle-kit v1 stores each migration as `<timestamp>_<name>/migration.sql`;
 * `drizzle-orm`'s migrator discovers those subdirectories itself, so no
 * `meta/_journal.json` is involved.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

/** Default database path, mirroring the `FUNNEL_DB` default in `src/env.ts`. */
export const DEFAULT_DB_PATH = "./data/funnel.db";

/** The migrations table `drizzle-orm`'s migrator creates and reads. */
export const MIGRATIONS_TABLE = "__drizzle_migrations";

/** Environment override for the migrations folder location. */
export const MIGRATIONS_DIR_ENV = "FUNNEL_MIGRATIONS_DIR";

/** Whether `dir` looks like a drizzle-kit migrations folder. */
export function isMigrationsFolder(dir: string): boolean {
  try {
    return readdirSync(dir, { withFileTypes: true }).some(
      (entry) =>
        entry.isDirectory() && existsSync(join(dir, entry.name, "migration.sql")),
    );
  } catch {
    return false;
  }
}

/** Number of migration directories in a drizzle-kit migrations folder. */
export function countMigrations(dir: string): number {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(dir, entry.name, "migration.sql")),
    ).length;
  } catch {
    return 0;
  }
}

/**
 * Locate the migrations folder. Honors `FUNNEL_MIGRATIONS_DIR`, then probes the
 * layouts we ship: embedded beside the executable, an adapter-node deploy that
 * keeps `drizzle/` at the app root, and a source checkout.
 */
export function resolveMigrationsFolder(): string {
  const candidates = [
    process.env[MIGRATIONS_DIR_ENV],
    join(import.meta.dir, "drizzle"),
    join(process.cwd(), "drizzle"),
    resolve(import.meta.dir, "../../../../drizzle"),
  ].filter((candidate): candidate is string =>
    Boolean(candidate && candidate.trim()),
  );

  for (const candidate of candidates) {
    const dir = isAbsolute(candidate)
      ? candidate
      : resolve(process.cwd(), candidate);
    if (isMigrationsFolder(dir)) return dir;
  }

  throw new Error(
    `Could not find the Drizzle migrations folder (a directory containing <timestamp>_*/migration.sql). ` +
      `Set ${MIGRATIONS_DIR_ENV} to its absolute path. Tried: ${candidates.join(", ")}`,
  );
}

/** Resolve the database path from the environment, applying the default. */
export function resolveDbPath(): string {
  return process.env.FUNNEL_DB?.trim() || DEFAULT_DB_PATH;
}

/** Applied migration count, or `null` when the migrations table is absent. */
export function appliedMigrationCount(sqlite: Database): number | null {
  try {
    const row = sqlite
      .query(`SELECT count(*) AS count FROM ${MIGRATIONS_TABLE}`)
      .get() as { count: number } | null;
    return row?.count ?? 0;
  } catch {
    return null;
  }
}

export interface MigrationReport {
  /** Absolute or configured path of the database the migrations ran against. */
  dbPath: string;
  /** The migrations folder that was applied. */
  migrationsFolder: string;
  /** Applied count before this run (`null` when the table did not exist yet). */
  before: number | null;
  /** Applied count after this run. */
  after: number;
  /** Number of migrations applied by this run. */
  applied: number;
}

/**
 * Apply every pending migration to the resolved database and close the
 * connection. Idempotent, and safe for a single writer (SQLite WAL plus
 * `busy_timeout`); `drizzle-orm` wraps each migration in a transaction.
 */
export function runMigrations(
  options: { dbPath?: string; migrationsFolder?: string } = {},
): MigrationReport {
  const dbPath = options.dbPath ?? resolveDbPath();
  const migrationsFolder =
    options.migrationsFolder ?? resolveMigrationsFolder();

  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath, { create: true });
  try {
    sqlite.run("PRAGMA journal_mode = WAL;");
    sqlite.run("PRAGMA busy_timeout = 5000;");
    sqlite.run("PRAGMA foreign_keys = ON;");

    const before = appliedMigrationCount(sqlite);
    migrate(drizzle({ client: sqlite }), { migrationsFolder });
    const after = appliedMigrationCount(sqlite) ?? 0;

    return {
      dbPath,
      migrationsFolder,
      before,
      after,
      applied: after - (before ?? 0),
    };
  } finally {
    sqlite.close();
  }
}
