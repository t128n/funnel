/**
 * Access control for the first-run `/onboarding` wizard.
 *
 * A fresh instance has no GitHub App and therefore no way to sign in, so the
 * wizard is reachable unauthenticated. `FUNNEL_ONBOARDING_TOKEN`, when set,
 * gates it: the operator shares the token, the wizard stores it in an
 * HttpOnly cookie, and every later onboarding request requires it. When the
 * variable is unset the wizard is open (Coolify-style) until the App is
 * created, after which the first-run gate closes it automatically.
 */
import { timingSafeEqual } from "node:crypto";
import { redirect, type RequestEvent } from "@sveltejs/kit";
import { FUNNEL_ONBOARDING_TOKEN, FUNNEL_URL } from "$app/env/private";

/** Cookie holding the accepted onboarding token. */
export const ONBOARDING_TOKEN_COOKIE = "funnel_onboarding_token";

/** Whether a token is configured (the wizard is locked to token-holders). */
export function onboardingTokenRequired(): boolean {
  return Boolean(FUNNEL_ONBOARDING_TOKEN);
}

/** Constant-time string comparison; false on a length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Validate an incoming token and, on success, persist it to a cookie. Returns
 * `true` when the caller may proceed, `false` when the wizard must render its
 * token prompt.
 */
export function acceptOnboardingToken(event: RequestEvent): boolean {
  if (!onboardingTokenRequired()) return true;
  const provided = event.url.searchParams.get("token");
  if (provided && safeEqual(provided, FUNNEL_ONBOARDING_TOKEN!)) {
    event.cookies.set(ONBOARDING_TOKEN_COOKIE, FUNNEL_ONBOARDING_TOKEN!, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60,
    });
    throw redirect(303, "/onboarding");
  }
  const stored = event.cookies.get(ONBOARDING_TOKEN_COOKIE);
  return Boolean(stored && safeEqual(stored, FUNNEL_ONBOARDING_TOKEN!));
}

/** Redirect to the wizard (which shows the token prompt) when access is denied. */
export function requireOnboardingAccess(event: RequestEvent): void {
  if (!onboardingTokenRequired()) return;
  const stored = event.cookies.get(ONBOARDING_TOKEN_COOKIE);
  if (!stored || !safeEqual(stored, FUNNEL_ONBOARDING_TOKEN!)) {
    throw redirect(303, "/onboarding");
  }
}

/** The single GitHub web URL the instance is registered against. */
export function resolvePublicOrigin(requestUrl: URL): string {
  return (FUNNEL_URL ?? requestUrl.origin).replace(/\/$/, "");
}
