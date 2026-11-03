import { redirect } from "@sveltejs/kit";
import { issuePath } from "#lib/issue-url";
import type { PageServerLoad } from "./$types";

/**
 * Board detail links predate Composition A's dedicated issue page. Keep the
 * URL working by redirecting to `/issues/<owner>/<repo>/<n>` rather than
 * rendering a second split-pane composition.
 */
export const load: PageServerLoad = ({ params, url }) => {
  redirect(307, `${issuePath("issues", `${params.owner}/${params.repo}`, Number(params.number))}${url.search}`);
};
