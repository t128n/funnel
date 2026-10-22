import { redirect } from "@sveltejs/kit";
import { createLogger } from "#lib/server/log";
import {
  exchangeManifestCode,
  toCredentialsInput,
} from "#lib/server/github/manifest-flow.server";
import { saveManifestCredentials } from "#lib/server/github/credentials";
import { forge } from "#lib/server/forge/providers.server";
import { resetAuthCache } from "#lib/server/auth/index";
import {
  requireOnboardingAccess,
  resolvePublicOrigin,
} from "#lib/server/onboarding/access";
import type { RequestHandler } from "./$types";

const log = createLogger({ component: "onboarding" });
const STATE_COOKIE = "funnel_manifest_state";

/**
 * GitHub redirects here after the user approves the pre-filled registration,
 * carrying a temporary conversion `code` and the `state` we set. Validate the
 * state, exchange the code for the App credentials, persist them (encrypted),
 * then move the user on to installing the App.
 */
export const GET: RequestHandler = async (event) => {
  requireOnboardingAccess(event);

  const code = event.url.searchParams.get("code");
  const state = event.url.searchParams.get("state");
  const expected = event.cookies.get(STATE_COOKIE);
  event.cookies.delete(STATE_COOKIE, { path: "/" });

  if (!code || !state || !expected || state !== expected) {
    log.warn({ hasCode: Boolean(code), hasState: Boolean(state) }, "bad callback");
    throw redirect(303, "/onboarding?error=state");
  }

  try {
    const conversion = await exchangeManifestCode(code);
    saveManifestCredentials(
      toCredentialsInput(conversion, resolvePublicOrigin(event.url)),
    );
    log.info(
      { appId: conversion.id, slug: conversion.slug },
      "github app created",
    );
  } catch (error) {
    log.error({ err: error }, "manifest conversion failed");
    throw redirect(303, "/onboarding?error=exchange");
  }

  // The App and its OAuth client changed: drop the derived singletons so the
  // install step and subsequent requests use the new credentials.
  forge.resetCaches();
  resetAuthCache();

  throw redirect(303, "/onboarding/install");
};
