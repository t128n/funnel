import { error, redirect } from "@sveltejs/kit";
import { canAdmin } from "#lib/roles";
import { requireAdmin } from "#lib/server/auth/guard";
import {
  clearGithubCredentials,
  getGithubCredentials,
} from "#lib/server/github/credentials";
import { forge } from "#lib/server/forge/providers.server";
import { resetAuthCache } from "#lib/server/auth/index";
import { installationUrl } from "#lib/server/github/manifest-flow.server";
import { webhookUrl } from "#lib/server/github/manifest";
import { createLogger } from "#lib/server/log";
import type { Actions, PageServerLoad } from "./$types";

const log = createLogger({ component: "onboarding" });

/** Management view for the manifest-created GitHub App (System settings). */
export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals, url);
  const credentials = getGithubCredentials();
  if (!credentials) {
    return {
      configured: false,
      credentials: null,
      installUrl: null,
      webhookConfigured: false,
      webhookUrl: null,
    };
  }
  return {
    configured: true,
    installUrl: await installationUrl(credentials.slug),
    webhookConfigured: Boolean(credentials.webhookSecret),
    webhookUrl: webhookUrl(credentials.baseUrl),
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
  reset: ({ locals }) => {
    if (!canAdmin((locals.user as { role?: unknown } | null)?.role)) {
      throw error(403, "Administrator role required");
    }
    log.warn("github app credentials cleared from settings");
    clearGithubCredentials();
    forge.resetCaches();
    resetAuthCache();
    throw redirect(303, "/onboarding");
  },
};
