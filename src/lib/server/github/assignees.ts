/**
 * Repo collaborator lookup for the assignee picker (SPEC §9.2).
 *
 * GitHub's `GET /repos/{owner}/{repo}/assignees` lists the users that may be
 * assigned to an issue in the repo. Funnel mirrors this per repo so the
 * Inspector Pane can offer assignees without a network call on the read path
 * (the write itself still runs against GitHub with the user token).
 */
import type { InstallationOctokit } from "./app.server";
import type { UserRecord } from "#lib/server/sync/mirror";

const PER_PAGE = 100;

interface RestAssignee {
  id?: number;
  login?: string;
  avatar_url?: string;
}

/** Walk paginated `GET /repos/{owner}/{repo}/assignees` until a short page. */
export async function listRepoAssignees(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
): Promise<UserRecord[]> {
  const all: UserRecord[] = [];
  for (let page = 1; ; page++) {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/assignees",
      { owner, repo, per_page: PER_PAGE, page },
    );
    const items = data as unknown as RestAssignee[];
    for (const item of items) {
      if (typeof item.id === "number" && typeof item.login === "string") {
        all.push({
          githubId: item.id,
          login: item.login,
          avatarUrl: item.avatar_url ?? "",
        });
      }
    }
    if (items.length < PER_PAGE) break;
  }
  return all;
}
