import { db } from "#lib/server/db/index";
import { clearQueryCaches } from "#lib/server/issues/queries";
import { resetMirrorRevision } from "#lib/server/sync/revision";

/**
 * Wipe every disposable `mirror_*` table. Bun runs test files in one process
 * against a single in-memory DB, so sync tests call this in `beforeEach` to
 * keep their mirror state isolated. Children are deleted before parents
 * because the junction tables carry no FK cascade to the thread rows (see
 * `db/schema.ts`).
 *
 * The read caches in `issues/queries` are keyed by mirror revision, so they are
 * dropped here too: tests seed the mirror directly without publishing, and a
 * cache from the previous test must never leak into the next one.
 */
export function clearMirror(): void {
  clearQueryCaches();
  resetMirrorRevision();
  // Keep internal ids deterministic for tests that seed fixed repo ids.
  db.$client.query("DELETE FROM sqlite_sequence WHERE name LIKE 'mirror_%'").run();
  for (const table of [
    "mirror_thread_label",
    "mirror_thread_assignee",
    "mirror_comment",
    "mirror_thread",
    "mirror_milestone",
    "mirror_repo_label",
    "mirror_repo_assignee",
    "mirror_user",
    "mirror_repo",
  ]) {
    db.$client.query(`DELETE FROM ${table}`).run();
  }
}
