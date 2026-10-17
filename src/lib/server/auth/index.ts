import { and, eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  FUNNEL_SECRET,
  FUNNEL_URL,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
} from "$app/env/private";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
} from "#lib/server/db/schema";

// SPEC section 11: `session.idle_days`, default 30. Hardcoded until
// `funnel.config.yaml` exists; then read it from config instead.
const SESSION_IDLE_DAYS = 30;
const DAY_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  // Doubles as the secret for signing and for encrypting stored OAuth tokens.
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
  account: {
    // SPEC 8: user-to-server OAuth tokens and refresh tokens are stored
    // encrypted at rest in `auth_account`, keyed off FUNNEL_SECRET. With this
    // flag Better Auth encrypts `accessToken`/`refreshToken` on write (see
    // `linkOAuthAccount`) and decrypts them on read (`getAccessToken`,
    // `accountInfo`, `refreshToken`). The cipher is XChaCha20-Poly1305 with a
    // SHA-256-derived key — an AEAD, so the ciphertext is authenticated too.
    // Better Auth picks the algorithm; the earlier "AES-GCM" wording in the
    // roadmap is superseded by this built-in.
    encryptOAuthTokens: true,
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

/**
 * Resolve a currently-valid GitHub user access token for `userId`.
 *
 * SPEC 8 token refresh: Better Auth records `accessTokenExpiresAt` (GitHub App
 * user-to-server tokens expire after ~8h) and, when a token is within 5
 * seconds of expiry, refreshes it through the provider's `refreshAccessToken`
 * before returning it, persisting the rotated access/refresh tokens (still
 * encrypted) back to `auth_account`. This is the automatic refresh path for
 * write operations — call it instead of reading `auth_account.accessToken`
 * directly, which now holds ciphertext. Compose it with the GitHub client:
 * `await github.asUser(await getUserAccessToken(userId))`.
 */
export async function getUserAccessToken(userId: string): Promise<string> {
  const [account] = await db
    .select({ id: authAccount.id })
    .from(authAccount)
    .where(
      and(eq(authAccount.userId, userId), eq(authAccount.providerId, "github")),
    )
    .limit(1);
  if (!account) {
    throw new Error(`No GitHub account linked for user ${userId}`);
  }
  const { accessToken } = await auth.api.getAccessToken({
    body: { accountId: account.id, userId },
  });
  return accessToken;
}

/**
 * Resolve the signed-in user's numeric GitHub id.
 *
 * Better Auth stores the provider subject in `auth_account.accountId`; for the
 * GitHub provider that subject is `profile.id` (the numeric account id, as a
 * string). Mirror rows key people by that same numeric id
 * (`mirror_github_user.github_id`), so this is what "My Issues" and the
 * `assignee=me` filter compare against. Returns `null` when no GitHub account
 * is linked or the subject is not numeric.
 */
export async function getViewerGithubId(
  userId: string,
): Promise<number | null> {
  const [account] = await db
    .select({ accountId: authAccount.accountId })
    .from(authAccount)
    .where(
      and(eq(authAccount.userId, userId), eq(authAccount.providerId, "github")),
    )
    .limit(1);
  if (!account) return null;
  const id = Number(account.accountId);
  return Number.isFinite(id) ? id : null;
}
