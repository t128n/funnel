import { redirect } from "@sveltejs/kit";
import { getConfig } from "#lib/server/config";
import { hasGithubCredentials } from "#lib/server/github/credentials";
import { acceptOnboardingToken, resolvePublicOrigin } from "#lib/server/onboarding/access";
import type { PageServerLoad } from "./$types";

/** Suggest a globally-unique-ish App name from the instance hostname. */
function suggestedName(origin: string): string {
  let label = "funnel";
  try {
    label = new URL(origin).hostname.split(".")[0] || "funnel";
  } catch {
    // Non-URL origin (should not happen); keep the default.
  }
  return `funnel-${label}`.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 34);
}

const ERRORS: Record<string, string> = {
  name: "Enter a name for the GitHub App.",
  org: "Enter the organization that should own the App.",
  host: "Enter a valid GitHub host, for example github.com or acme.ghe.com.",
  state: "The request could not be verified. Please start again.",
  exchange: "GitHub rejected the manifest conversion. Please try again.",
};

export const load: PageServerLoad = async (event) => {
  // The wizard is only for the first run; once an App exists, sign-in is how
  // in (the install step re-enters via the exempt `/onboarding/*` routes).
  if (hasGithubCredentials()) throw redirect(303, "/login");

  const unlocked = acceptOnboardingToken(event);
  const config = await getConfig();
  const publicOrigin = resolvePublicOrigin(event.url);
  const errorCode = event.url.searchParams.get("error");

  return {
    locked: !unlocked,
    host: config.github,
    publicOrigin,
    suggestedName: suggestedName(publicOrigin),
    error: errorCode ? (ERRORS[errorCode] ?? "Something went wrong.") : null,
  };
};
