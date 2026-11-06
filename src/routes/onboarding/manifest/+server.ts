import { redirect } from "@sveltejs/kit";
import { hasGithubCredentials } from "#lib/server/github/credentials";
import {
  GithubHostError,
  normalizeGithubHost,
  type GithubHosts,
} from "#lib/server/github/hosts";
import {
  buildManifest,
  buildManifestFormHtml,
  manifestFormAction,
} from "#lib/server/github/manifest";
import {
  requireOnboardingAccess,
  resolvePublicOrigin,
} from "#lib/server/onboarding/access";
import { sealManifestState } from "#lib/server/onboarding/manifest-state.server";
import type { RequestHandler } from "./$types";

/** Cookie holding the CSRF `state` for the manifest round-trip. */
const STATE_COOKIE = "funnel_manifest_state";

/**
 * Hand the manifest off to GitHub. GitHub only accepts the manifest from a form
 * POST, so this returns a self-submitting HTML page rather than a redirect.
 * The `state` is stashed in a cookie and verified on the conversion callback.
 */
export const POST: RequestHandler = async (event) => {
  requireOnboardingAccess(event);
  if (hasGithubCredentials()) throw redirect(303, "/login");

  const form = await event.request.formData();
  const name = String(form.get("name") ?? "").trim();
  const account = String(form.get("account") ?? "user");
  const org = String(form.get("org") ?? "").trim();
  const hostInput = String(form.get("githubHost") ?? "").trim();

  if (!name) throw redirect(303, "/onboarding?error=name");
  if (account === "organization" && !org) {
    throw redirect(303, "/onboarding?error=org");
  }

  let hosts: GithubHosts;
  try {
    hosts = normalizeGithubHost(hostInput);
  } catch (error) {
    if (error instanceof GithubHostError) {
      throw redirect(303, "/onboarding?error=host");
    }
    throw error;
  }

  const state = crypto.randomUUID();
  event.cookies.set(
    STATE_COOKIE,
    sealManifestState({ state, github: hosts }),
    {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: event.url.protocol === "https:",
      maxAge: 60 * 10,
    },
  );

  const baseUrl = resolvePublicOrigin(event.url);
  const manifest = buildManifest(name, {
    baseUrl,
    callbackUrl: `${baseUrl}/api/auth/callback/github`,
    redirectUrl: `${baseUrl}/onboarding/callback`,
    setupUrl: `${baseUrl}/onboarding/installed`,
  });
  const action = manifestFormAction(
    hosts.url,
    account === "organization" ? { type: "organization", org } : { type: "user" },
  );

  return new Response(buildManifestFormHtml(action, manifest, state), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
