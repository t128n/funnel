import { redirect } from "@sveltejs/kit";
import { createLogger } from "#lib/server/log";
import { getGithubCredentials, setInstallationId } from "#lib/server/github/credentials";
import { forge } from "#lib/server/forge/providers.server";
import {
  installationUrl,
  listInstallationRepos,
  listInstallations,
  type InstallationRepo,
} from "#lib/server/github/manifest-flow.server";
import { requireOnboardingAccess } from "#lib/server/onboarding/access";
import { applySettings } from "#lib/server/settings/apply";
import type { Actions, PageServerLoad } from "./$types";

const log = createLogger({ component: "onboarding" });

/**
 * Stage 3: capture the installation and choose repositories. GitHub's Setup
 * URL sends the user back here with `installation_id`; if it is missing (the
 * user landed here directly) fall back to the App's installation list.
 */
export const load: PageServerLoad = async (event) => {
  requireOnboardingAccess(event);
  const credentials = getGithubCredentials();
  if (!credentials) throw redirect(303, "/onboarding");

  const installUrl = await installationUrl(credentials.slug);
  const fromQuery = Number(event.url.searchParams.get("installation_id"));
  let installationId =
    Number.isFinite(fromQuery) && fromQuery > 0
      ? fromQuery
      : credentials.installationId;

  if (!installationId) {
    try {
      const installations = await listInstallations();
      if (installations.length === 1) installationId = installations[0].id;
    } catch (error) {
      log.warn({ err: error }, "could not list installations");
    }
  }

  if (!installationId) {
    return {
      installed: false,
      appName: credentials.name,
      ownerLogin: credentials.ownerLogin,
      installUrl,
      installationId: null,
      repos: [] as InstallationRepo[],
      error: null as string | null,
    };
  }

  if (credentials.installationId !== installationId) {
    setInstallationId(installationId);
    forge.resetCaches();
  }

  let repos: InstallationRepo[] = [];
  let error: string | null = null;
  try {
    repos = await listInstallationRepos(installationId);
  } catch (cause) {
    log.warn({ err: cause, installationId }, "could not list installation repos");
    error = "Could not list the installation's repositories. You can add them later in Settings.";
  }

  return {
    installed: true,
    appName: credentials.name,
    ownerLogin: credentials.ownerLogin,
    installUrl,
    installationId,
    repos,
    error,
  };
};

export const actions: Actions = {
  /** Persist the picked repositories and send the user to sign in. */
  save: async (event) => {
    requireOnboardingAccess(event);
    const form = await event.request.formData();
    const repos = form
      .getAll("repos")
      .map((value) => String(value).trim())
      .filter(Boolean);

    applySettings({ repos });
    throw redirect(303, "/login");
  },
};
