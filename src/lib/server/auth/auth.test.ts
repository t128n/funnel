import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { FUNNEL_SECRET } from "$app/env/private";
import { db } from "#lib/server/db/index";
import { authAccount, authUser } from "#lib/server/db/schema";
import { auth, getUserAccessToken } from "./index";

// No migration runner yet, so create the touched tables directly. Names and
// columns must match `schema.ts` (`auth_*`, camelCase imposed by Better Auth).
function createAuthTables() {
  db.$client.run(
    "CREATE TABLE IF NOT EXISTS auth_verification (" +
      "id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, " +
      "expiresAt INTEGER NOT NULL, createdAt INTEGER, updatedAt INTEGER)",
  );
  db.$client.run(
    "CREATE TABLE IF NOT EXISTS auth_user (" +
      "id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, " +
      "emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, " +
      "createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)",
  );
  db.$client.run(
    "CREATE TABLE IF NOT EXISTS auth_account (" +
      "id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL, " +
      "userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, " +
      "accessToken TEXT, refreshToken TEXT, idToken TEXT, " +
      "accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT, " +
      "password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)",
  );
}

describe("auth smoke", () => {
  test("github provider configured with client id", () => {
    const providers = auth.options.socialProviders;
    expect(providers?.github?.clientId).toBe("Iv1.0123456789abcdef");
  });

  test("oauth tokens are encrypted at rest", () => {
    expect(auth.options.account?.encryptOAuthTokens).toBe(true);
  });

  test("sign-in stores oauth state and returns github url", async () => {
    createAuthTables();
    const res = await auth.api.signInSocial({
      body: { provider: "github", callbackURL: "/" },
    });
    expect(res.url).toContain("github.com");
    expect(res.url).toContain("client_id=Iv1.0123456789abcdef");
    const rows = db.$client
      .query(
        "SELECT * FROM auth_verification WHERE identifier LIKE 'auth-state:%'",
      )
      .all();
    expect(rows.length).toBe(1);
  });

  test("session expiry matches 30-day idle default", () => {
    expect(auth.options.session?.expiresIn).toBe(60 * 60 * 24 * 30);
  });
});

describe("getUserAccessToken", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function seedUser(id: string, email: string) {
    const now = new Date();
    await db
      .insert(authUser)
      .values({
        id,
        name: id,
        email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  test("refreshes an expiring token and keeps it encrypted at rest", async () => {
    createAuthTables();
    const now = new Date();
    await seedUser("user_1", "user_1@example.com");
    await db
      .insert(authAccount)
      .values({
        id: "acc_1",
        accountId: "42",
        providerId: "github",
        userId: "user_1",
        accessToken: await symmetricEncrypt({
          key: FUNNEL_SECRET,
          data: "ghu_old",
        }),
        refreshToken: await symmetricEncrypt({
          key: FUNNEL_SECRET,
          data: "ghr_old",
        }),
        accessTokenExpiresAt: new Date(Date.now() - 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 1_000_000_000),
        scope: "repo,read:user",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    globalThis.fetch = (async (input: unknown) => {
      expect(String(input)).toContain("login/oauth/access_token");
      return Response.json({
        access_token: "ghu_new",
        expires_in: 28800,
        refresh_token: "ghr_new",
        refresh_token_expires_in: 17592000,
        scope: "repo",
        token_type: "bearer",
      });
    }) as typeof fetch;

    expect(await getUserAccessToken("user_1")).toBe("ghu_new");

    const [row] = await db
      .select()
      .from(authAccount)
      .where(eq(authAccount.id, "acc_1"));
    // The rotated tokens are persisted encrypted, never plaintext.
    expect(row.accessToken).not.toBe("ghu_new");
    expect(
      await symmetricDecrypt({ key: FUNNEL_SECRET, data: row.accessToken! }),
    ).toBe("ghu_new");
    expect(
      await symmetricDecrypt({ key: FUNNEL_SECRET, data: row.refreshToken! }),
    ).toBe("ghr_new");
  });

  test("returns the stored token without a network call when fresh", async () => {
    createAuthTables();
    const now = new Date();
    await seedUser("user_2", "user_2@example.com");
    await db
      .insert(authAccount)
      .values({
        id: "acc_2",
        accountId: "43",
        providerId: "github",
        userId: "user_2",
        accessToken: await symmetricEncrypt({
          key: FUNNEL_SECRET,
          data: "ghu_fresh",
        }),
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    globalThis.fetch = (async () => {
      throw new Error("fresh token must not trigger a refresh");
    }) as unknown as typeof fetch;

    expect(await getUserAccessToken("user_2")).toBe("ghu_fresh");
  });
});
