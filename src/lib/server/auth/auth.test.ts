import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { FUNNEL_SECRET } from "$app/env/private";
import { resetConfigCache } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { authAccount, authUser } from "#lib/server/db/schema";
import { saveManifestCredentials } from "#lib/server/github/credentials";
import { seedTestGithubApp } from "#tests/github-app";
import { getAuth, getUserAccessToken, resetAuthCache } from "./index";

describe("auth smoke", () => {
  test("github provider configured with client id", async () => {
    const auth = await getAuth();
    const providers = auth?.options.socialProviders;
    expect(providers?.github?.clientId).toBe("Iv1.0123456789abcdef");
  });

  test("oauth tokens are encrypted at rest", async () => {
    const auth = await getAuth();
    expect(auth?.options.account?.encryptOAuthTokens).toBe(true);
  });

  test("sign-in stores oauth state and returns github url", async () => {
    const auth = (await getAuth())!;
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

  test("session expiry matches 30-day idle default", async () => {
    const auth = await getAuth();
    expect(auth?.options.session?.expiresIn).toBe(60 * 60 * 24 * 30);
  });
});

describe("GitHub Enterprise OAuth", () => {
  afterEach(async () => {
    await seedTestGithubApp();
    resetConfigCache();
    resetAuthCache();
  });

  test("sign-in uses the GHES authorization endpoint", async () => {
    saveManifestCredentials({
      appId: 987,
      slug: "funnel-ghe",
      name: "funnel-ghe",
      ownerLogin: "acme",
      ownerType: "Organization",
      htmlUrl: "https://acme.ghe.com/settings/apps/funnel-ghe",
      baseUrl: "http://localhost:5173",
      githubUrl: "https://acme.ghe.com",
      githubApiUrl: "https://acme.ghe.com/api/v3",
      clientId: "Iv1.ghe",
      clientSecret: "s".repeat(40),
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----",
    });
    resetConfigCache();
    resetAuthCache();

    const auth = (await getAuth())!;
    const res = await auth.api.signInSocial({
      body: { provider: "github", callbackURL: "/" },
    });
    expect(res.url).toContain("https://acme.ghe.com/login/oauth/authorize");
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
