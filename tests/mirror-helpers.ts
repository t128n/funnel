import { db } from "#lib/server/db/index";

/**
 * Wipe every disposable `mirror_*` table. Bun runs test files in one process
 * against a single in-memory DB, so sync tests call this in `beforeEach` to
 * keep their mirror state isolated. Children are deleted before parents
 * because the junction tables carry no FK cascade to the thread rows (see
 * `db/schema.ts`).
 */
export function clearMirror(): void {
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
