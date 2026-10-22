/**
 * Repo collaborator lookup for the assignee picker (SPEC §9.2).
 *
 * GitHub's `GET /repos/{owner}/{repo}/assignees` lists the users that may be
 * assigned to an issue in the repo. Funnel mirrors this per repo so the
 * Inspector Pane can offer assignees without a network call on the read path
 * (the write itself still runs against GitHub with the user token).
 *
 * The read goes through a `forges` installation provider, which paginates the
 * endpoint for us; each `Actor` maps onto the mirror's {@link UserRecord}.
 */
import type { UserRecord } from "#lib/server/sync/mirror";
import {
  forge,
  type GitHubProvider,
} from "#/lib/server/forge/providers.server";

/** Walk the repo's assignable users and map them to mirror users. */
export async function listRepoAssignees(
  provider: GitHubProvider,
  owner: string,
  repo: string,
): Promise<UserRecord[]> {
  const all: UserRecord[] = [];
  for await (const actor of provider.repos.assignableUsers(
    forge.repoRef(owner, repo),
  )) {
    const githubId = Number(actor.id);
    if (!Number.isInteger(githubId)) continue;
    all.push({
      githubId,
      login: actor.login,
      avatarUrl: actor.avatarUrl ?? "",
    });
  }
  return all;
}
