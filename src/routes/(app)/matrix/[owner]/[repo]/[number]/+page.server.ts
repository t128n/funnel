import { redirect } from "@sveltejs/kit";
import { issuePath } from "#lib/issue-url";
import type { PageServerLoad } from "./$types";

/** Matrix detail links redirect to Composition A's dedicated issue page. */
export const load: PageServerLoad = ({ params, url }) => {
  redirect(307, `${issuePath("issues", `${params.owner}/${params.repo}`, Number(params.number))}${url.search}`);
};
