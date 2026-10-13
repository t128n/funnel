import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  FUNNEL_SECRET,
  FUNNEL_URL,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
} from "$app/env/private";
import { db } from "#lib/server/db/index.js";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
} from "#lib/server/db/schema.js";

// SPEC section 11: `session.idle_days`, default 30. Hardcoded until
// `funnel.config.yaml` exists; then read it from config instead.
const SESSION_IDLE_DAYS = 30;
const DAY_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  // Doubles as the secret for signing. SPEC section 8 additionally
  // requires encryption of stored GitHub tokens at rest and refresh of
  // short-lived GitHub App user-to-server tokens — neither is known to
  // be handled by the GitHub provider (SPEC section 17, open item), so
  // both are TODO above this layer, keyed off FUNNEL_SECRET.
  secret: FUNNEL_SECRET,
  baseURL: FUNNEL_URL,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),
  socialProviders: {
    github: {
      clientId: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      // `repo` covers issue reads/writes on private repos (SPEC 8:
      // the installation needs Issues read/write). `read:user` identifies
      // who signed in. No admin or workflow scopes.
      scope: ["read:user", "repo"],
    },
  },
  session: {
    expiresIn: DAY_SECONDS * SESSION_IDLE_DAYS,
    updateAge: DAY_SECONDS,
  },
});

/** Server-side session lookup for `load` functions and API routes. */
export function getSession(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}

export type Session = typeof auth.$Infer.Session;
