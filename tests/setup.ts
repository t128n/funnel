import { mock } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";

// Runs via `bun test --preload ./tests/setup.ts` before any test file
// loads, so the `$app/env/private` mock below applies to static imports.
// A real RSA key is generated so `@octokit/auth-app` JWT signing works
// offline (tests stub `fetch` for the network itself).
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

mock.module("$app/env/private", () => ({
  FUNNEL_URL: "http://localhost:5173",
  FUNNEL_SECRET: "0123456789abcdef0123456789abcdef",
  FUNNEL_DB: ":memory:",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: privateKey,
  GITHUB_CLIENT_ID: "Iv1.0123456789abcdef",
  GITHUB_CLIENT_SECRET: "0123456789abcdef0123456789abcdef01234567",
  LOG_LEVEL: "silent",
}));

// Apply the committed Drizzle migration to the in-memory DB so tests exercise
// the same schema the server gets from `bun run db:migrate` (applied
// out-of-band; there is no startup initializer). Dynamic imports are required
// here: static ones would evaluate `db/index.ts` — and its `$app/env/private`
// read — before the mock above is registered. `migrate` is synchronous for
// bun:sqlite.
const { db } = await import("#lib/server/db/index");
const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
migrate(db, {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});
