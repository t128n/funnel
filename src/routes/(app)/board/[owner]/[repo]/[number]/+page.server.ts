import { error } from "@sveltejs/kit";
import { parseIssueParams } from "#lib/issue-url";
import type { PageServerLoad } from "./$types";

/** Reject malformed detail links with a real 404 (see the Issues equivalent). */
export const load: PageServerLoad = ({ params }) => {
  if (!parseIssueParams(params)) error(404, "Issue not found");
  return {};
};
