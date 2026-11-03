import { redirect } from "@sveltejs/kit";
import { issuePath } from "#lib/issue-url";
import type { PageServerLoad } from "./$types";

/**
 * Inbox issue links predate the dedicated issue page. Redirect to `/issues`
 * so a triager opening an untriaged issue lands on the same document page as
 * every other issue. Staged submissions keep their own review route.
 */
export const load: PageServerLoad = ({ params, url }) => {
  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) {
    redirect(307, `/inbox`);
  }
  redirect(307, `${issuePath("issues", `${params.owner}/${params.repo}`, number)}${url.search}`);
};
