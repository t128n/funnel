import { redirect } from "@sveltejs/kit";
import { getGithubCredentials } from "#lib/server/github/credentials";
import { installationUrl } from "#lib/server/github/manifest-flow.server";
import { requireOnboardingAccess } from "#lib/server/onboarding/access";
import type { PageServerLoad } from "./$types";

/**
 * Stage 2: install the freshly created App. Creating an App grants no access
 * to code until it is installed on an account or organization, so GitHub's
 * install page is where the user chooses repositories.
 */
export const load: PageServerLoad = async (event) => {
  requireOnboardingAccess(event);
  const credentials = getGithubCredentials();
  if (!credentials) throw redirect(303, "/onboarding");

  return {
    appName: credentials.name,
    appSlug: credentials.slug,
    ownerLogin: credentials.ownerLogin,
    installUrl: await installationUrl(credentials.slug),
  };
};
