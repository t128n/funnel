import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { FUNNEL_DB } from "$app/env/private";

if (FUNNEL_DB !== ":memory:") {
  mkdirSync(dirname(FUNNEL_DB), { recursive: true });
}

const sqlite = new Database(FUNNEL_DB, { create: true });

// Write-Ahead Logging for better concurrent read/write performance.
sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA busy_timeout = 5000;");
sqlite.run("PRAGMA foreign_keys = ON;");

export const db = drizzle({ client: sqlite });
