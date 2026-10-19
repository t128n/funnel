import { error } from "@sveltejs/kit";
import { parseIssueParams } from "#lib/issue-url";
import type { PageServerLoad } from "./$types";

/**
 * Reject malformed detail links with a real 404 (rather than rendering an
 * "Issue unavailable" placeholder under a 200). A syntactically valid link to
 * an issue the mirror has not seen yet is left to the Inspector's own empty
 * state, since the issue payload is fetched client-side.
 */
export const load: PageServerLoad = ({ params }) => {
  if (!parseIssueParams(params)) error(404, "Issue not found");
  return {};
};
