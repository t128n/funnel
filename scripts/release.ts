/**
 * Release-phase migration CLI: `bun run release`.
 *
 * Run this against the same `FUNNEL_DB` the server will use, before starting the
 * new version. On a PaaS use it as the release / pre-deploy command; in a
 * container it is a one-off `docker run --rm <image> bun run release`. The
 * packaged executable runs the same step on boot instead.
 */
import { runMigrations } from "#lib/server/db/release";

const report = runMigrations();

console.log(
  `[release] ${report.applied} migration(s) applied — db=${report.dbPath} migrations=${report.migrationsFolder} total=${report.after}`,
);
