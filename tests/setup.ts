import { mock } from "bun:test";
import { fileURLToPath } from "node:url";

// Runs via `bun test --preload ./tests/setup.ts` before any test file
// loads, so the `$app/env/private` mock below applies to static imports.
mock.module("$app/env/private", () => ({
  FUNNEL_URL: "http://localhost:5173",
  FUNNEL_SECRET: "0123456789abcdef0123456789abcdef",
  FUNNEL_DB: ":memory:",
  FUNNEL_UPLOAD_DIR: "./.test-uploads",
  FUNNEL_UPLOAD_MAX_BYTES: "10485760",
  GITHUB_URL: "https://github.com",
  GITHUB_API_URL: "https://api.github.com",
  FUNNEL_COMMENT_UI: "compact",
  FUNNEL_ONBOARDING_TOKEN: undefined,
  LOG_LEVEL: "silent",
}));

// `$app/*` are Vite/SvelteKit virtual modules and do not resolve under
// `bun test`; `src/lib/server/log.ts` reads the compile-time `dev` flag from
// here (and `hooks.server.ts` reads `building`). `LOG_LEVEL: "silent"` above
// keeps test output quiet regardless.
mock.module("$app/env", () => ({
  dev: true,
  building: false,
  browser: false,
  version: "test",
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

// Seed the GitHub App the server would have created via onboarding. Must run
// after `migrate` (it writes to `state_github_app`) and after the env mock
// (the credential store reads FUNNEL_SECRET to derive its encryption key).
const { seedTestGithubApp } = await import("./github-app");
await seedTestGithubApp();
