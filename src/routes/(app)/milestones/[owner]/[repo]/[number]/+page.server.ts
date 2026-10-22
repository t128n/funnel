import { error } from "@sveltejs/kit";
import { getMilestone, milestoneIssues } from "#lib/server/issues/queries";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import type { PageServerLoad } from "./$types";

/**
 * One repo-scoped milestone: its metadata plus every mirrored issue attached to
 * it (open and closed, triaged or not).
 */
export const load: PageServerLoad = async ({ params }) => {
  const repo = getRepoByOrgName(params.owner, params.repo);
  if (!repo) error(404, `Repository ${params.owner}/${params.repo} is not mirrored`);

  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) error(404, "Invalid milestone");

  const milestone = getMilestone(repo.id, number);
  if (!milestone) error(404, "Milestone is not mirrored");

  return {
    milestone,
    issues: milestoneIssues(repo.id, number),
  };
};
