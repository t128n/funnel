/**
 * Readiness probe.
 *
 * Answers "can this instance serve traffic?" — the database must be reachable
 * and every committed migration must have been applied. Returns `503` until
 * then, so a load balancer (or the packaged launcher, or a `docker run --rm
 * <image> bun run release` step that has not run yet) keeps traffic off a
 * half-migrated instance instead of surfacing "no such table" errors.
 *
 * Ungated like the other health surfaces: it exposes only migration counts.
 */
import { json } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  MIGRATIONS_TABLE,
  countMigrations,
  resolveMigrationsFolder,
} from "#lib/server/db/release";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
  // 1. The database must be reachable and already have the migrations table.
  let applied: number;
  try {
    const row = db.get<{ count: number }>(
      sql`select count(*) as count from ${sql.identifier(MIGRATIONS_TABLE)}`,
    );
    applied = row?.count ?? 0;
  } catch {
    return json(
      { status: "starting", reason: "database not migrated" },
      { status: 503 },
    );
  }

  // 2. Every committed migration must be applied. If the folder cannot be
  //    located (unusual deploy layout), fall back to "the table exists".
  let expected: number | null;
  try {
    expected = countMigrations(resolveMigrationsFolder());
  } catch {
    expected = null;
  }

  if (expected !== null && applied < expected) {
    return json(
      {
        status: "starting",
        reason: "migrations pending",
        applied,
        expected,
      },
      { status: 503 },
    );
  }

  return json({ status: "ready", applied, expected });
};
