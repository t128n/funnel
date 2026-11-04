import { error } from "@sveltejs/kit";
import { EMPTY_FILTER } from "#lib/server/issues/filters";
import { allIssues, getMilestone, milestoneIssues } from "#lib/server/issues/queries";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import { canWrite } from "#lib/roles";
import type { PageServerLoad } from "./$types";

/**
 * One repo-scoped milestone: its metadata plus every mirrored issue attached to
 * it (open and closed, triaged or not). Writers also receive the open,
 * unmilestoned issues in the same repo for the Add issues picker.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
  const repo = getRepoByOrgName(params.owner, params.repo);
  if (!repo) error(404, `Repository ${params.owner}/${params.repo} is not mirrored`);

  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) error(404, "Invalid milestone");

  const milestone = getMilestone(repo.id, number);
  if (!milestone) error(404, "Milestone is not mirrored");

  const candidates = canWrite(locals.user?.role)
    ? allIssues(
        {
          ...EMPTY_FILTER,
          repos: [repo.id],
          states: ["open"],
          noMilestone: true,
        },
        { limit: 200 },
      ).items
    : [];

  return {
    milestone,
    issues: milestoneIssues(repo.id, number),
    candidates,
  };
};
