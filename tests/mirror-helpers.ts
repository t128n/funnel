import { db } from "#lib/server/db/index";

/**
 * Wipe every disposable `mirror_github_*` table. Bun runs test files in one
 * process against a single in-memory DB, so sync tests call this in
 * `beforeEach` to keep their mirror state isolated. Children are deleted before
 * parents because the junction tables carry no FK cascade (see `db/schema.ts`).
 */
export function clearMirror(): void {
  for (const table of [
    "mirror_github_issue_label",
    "mirror_github_issue_assignee",
    "mirror_github_comment",
    "mirror_github_issue",
    "mirror_github_milestone",
    "mirror_github_repo_label",
    "mirror_github_repo_assignee",
    "mirror_github_user",
    "mirror_github_repo",
  ]) {
    db.$client.query(`DELETE FROM ${table}`).run();
  }
}
