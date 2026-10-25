import { and, eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { FUNNEL_SECRET, FUNNEL_URL } from "$app/env/private";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
} from "#lib/server/db/schema";
import { getGithubCredentials } from "#lib/server/github/credentials";
import { readSettings } from "#lib/server/settings/store";
import { isDemoMode } from "#lib/server/demo/mode";
import { roles } from "./access";
// SPEC section 11: `session.idle_days` (default 30), read from instance
// settings. Better Auth builds its options once per build, so a change made
// from the UI applies to sessions created after the auth instance is rebuilt
// (a credential change) or the process restarts.
function sessionIdleDays(): number {
  try {
    return readSettings().session.idle_days;
  } catch {
    // The settings table may not exist yet (migrations run out-of-band).
    return 30;
  }
}

const DAY_SECONDS = 60 * 60 * 24;

/**
 * Seed the first admin (RBAC bootstrap).
 *
 * The Better Auth admin plugin assigns every new account `defaultRole` =
 * `read`, including the very first one. A fresh instance would then have no
 * admin and no way to promote anyone, so the first account to sign in is
 * promoted to `admin` here. Runs after the user row exists; a no-op once any
 * admin is present. On a single-instance, single-file SQLite deployment the
 * race between two simultaneous first sign-ins is acceptable.
 */
export async function promoteFirstAdmin(userId: string): Promise<void> {
  const [existing] = await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(eq(authUser.role, "admin"))
    .limit(1);
  if (existing) return;
  await db
    .update(authUser)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(authUser.id, userId));
}

/**
 * Build the Better Auth instance for the current GitHub App.
 *
 * The App is created by the manifest flow during onboarding, so the OAuth
 * client credentials are not known at import time — and there may be none at
 * all on a fresh instance. This returns `null` until an App exists; the
 * first-run gate in `hooks.server.ts` routes such instances to `/onboarding`.
 *
 * `baseURL` is the public origin captured when the App was created (falling
 * back to `FUNNEL_URL` when set), so the OAuth callback URL registered on
 * GitHub as `{baseUrl}/api/auth/callback/github` resolves consistently.
 */
async function createAuth() {
  const credentials = getGithubCredentials();
  if (!credentials) return null;

  return betterAuth({
    // Doubles as the secret for signing and for encrypting stored OAuth tokens.
    secret: FUNNEL_SECRET,
    baseURL: FUNNEL_URL ?? credentials.baseUrl ?? undefined,
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
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
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
      encryptOAuthTokens: true,
    },
    session: {
      expiresIn: DAY_SECONDS * sessionIdleDays(),
      updateAge: DAY_SECONDS,
    },
    // RBAC: `role`/`banned`/`banExpires` live on `auth_user` and `role` on the
    // session, managed by the admin plugin. `defaultRole` is the safe `read`;
    // only `admin` reaches the `/api/auth/admin/*` endpoints (`adminRoles`).
    // The first account is promoted to admin by `promoteFirstAdmin`.
    plugins: [
      admin({
        defaultRole: "read",
        adminRoles: ["admin"],
        roles,
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await promoteFirstAdmin(user.id);
          },
        },
      },
    },
  });
}

/** The built instance type, used to derive the `Session` shape below. */
export type AuthInstance = NonNullable<Awaited<ReturnType<typeof createAuth>>>;

/** The `{ session, user }` shape threaded through `App.Locals`. */
export type Session = AuthInstance["$Infer"]["Session"];

let authPromise: Promise<AuthInstance | null> | undefined;

/**
 * The process-wide auth instance, or `null` while the instance is
 * unconfigured. Memoized, and re-armed on failure so a transient error does
 * not poison the process. Reset via {@link resetAuthCache} after onboarding
 * saves credentials.
 */
export function getAuth(): Promise<AuthInstance | null> {
  return (authPromise ??= createAuth().catch((error: unknown) => {
    authPromise = undefined;
    throw error;
  }));
}

/** Drop the cached auth instance (tests, or after a credential change). */
export function resetAuthCache(): void {
  authPromise = undefined;
}

/** Server-side session lookup for `load` functions and API routes. */
export async function getSession(request: Request) {
  const auth = await getAuth();
  if (!auth) return null;
  return auth.api.getSession({ headers: request.headers });
}

/**
 * Resolve a currently-valid GitHub user access token for `userId`.
 *
 * SPEC 8 token refresh: Better Auth records `accessTokenExpiresAt` (GitHub App
 * user-to-server tokens expire after ~8h) and, when a token is within 5
 * seconds of expiry, refreshes it through the provider's `refreshAccessToken`
 * before returning it, persisting the rotated access/refresh tokens (still
 * encrypted) back to `auth_account`. This is the automatic refresh path for
 * write operations — call it instead of reading `auth_account.accessToken`
 * directly, which now holds ciphertext. Compose it with the GitHub provider:
 * `forge.userProvider(await getUserAccessToken(userId))`.
 */
export async function getUserAccessToken(userId: string): Promise<string> {
  // Demo requests always act as the seeded admin; the local provider never
  // needs a real token and no Better Auth account row is consulted.
  if (isDemoMode()) return "demo-token";
  const auth = await getAuth();
  if (!auth) throw new Error("No GitHub App configured");
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
 * Resolve the signed-in user's forge-native external id.
 *
 * Better Auth stores the provider subject in `auth_account.accountId`; for the
 * GitHub provider that subject is `profile.id` (the numeric account id, as a
 * string). Mirror rows key people by `mirror_user.external_id`, so this is what
 * "My Issues" and the `assignee=me` filter compare against. Returns `null` when
 * no GitHub account is linked.
 */
export async function getViewerExternalId(
  userId: string,
): Promise<string | null> {
  const [account] = await db
    .select({ accountId: authAccount.accountId })
    .from(authAccount)
    .where(
      and(eq(authAccount.userId, userId), eq(authAccount.providerId, "github")),
    )
    .limit(1);
  return account?.accountId ?? null;
}
