import { redirect } from "@sveltejs/kit";
import {
  clearGithubCredentials,
  getGithubCredentials,
} from "#lib/server/github/credentials";
import { resetAppCache } from "#lib/server/github/app.server";
import { resetAuthCache } from "#lib/server/auth/index";
import { installationUrl } from "#lib/server/github/manifest-flow.server";
import { createLogger } from "#lib/server/log";
import type { Actions, PageServerLoad } from "./$types";

const log = createLogger({ component: "onboarding" });

/** Management view for the manifest-created GitHub App (System settings). */
export const load: PageServerLoad = async () => {
  const credentials = getGithubCredentials();
  if (!credentials) {
    return { configured: false, credentials: null, installUrl: null };
  }
  return {
    configured: true,
    installUrl: await installationUrl(credentials.slug),
    credentials: {
      appId: credentials.appId,
      name: credentials.name,
      slug: credentials.slug,
      ownerLogin: credentials.ownerLogin,
      ownerType: credentials.ownerType,
      htmlUrl: credentials.htmlUrl,
      baseUrl: credentials.baseUrl,
      clientId: credentials.clientId,
      installationId: credentials.installationId,
    },
  };
};

export const actions: Actions = {
  /**
   * Forget the App credentials and return to onboarding. Drop the derived
   * singletons so the next request re-reads the (now empty) credential store
   * and the first-run gate sends the browser to `/onboarding`.
   */
  reset: () => {
    log.warn("github app credentials cleared from settings");
    clearGithubCredentials();
    resetAppCache();
    resetAuthCache();
    throw redirect(303, "/onboarding");
  },
};
