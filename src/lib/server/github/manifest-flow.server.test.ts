import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import { forge } from "#/lib/server/forge/providers.server";
import { GHE_CONFIG, TEST_CONFIG } from "#tests/test-config";
import {
  exchangeManifestCode,
  installationUrl,
  listInstallations,
  listInstallationRepos,
  ManifestExchangeError,
  toCredentialsInput,
  type ManifestConversion,
} from "./manifest-flow.server";

const realFetch = globalThis.fetch;

beforeEach(() => {
  setConfig(TEST_CONFIG);
  forge.resetCaches();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  forge.resetCaches();
});

const CONVERSION: ManifestConversion = {
  id: 123,
  slug: "funnel-acme",
  name: "funnel-acme",
  owner: { login: "acme", type: "Organization" },
  html_url: "https://github.com/apps/funnel-acme",
  client_id: "Iv1.abc",
  client_secret: "shhh",
  pem: "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----",
};

describe("toCredentialsInput", () => {
  test("maps a conversion response into the stored shape", () => {
    expect(toCredentialsInput(CONVERSION, "https://funnel.test")).toEqual({
      appId: 123,
      slug: "funnel-acme",
      name: "funnel-acme",
      ownerLogin: "acme",
      ownerType: "Organization",
      htmlUrl: "https://github.com/apps/funnel-acme",
      baseUrl: "https://funnel.test",
      clientId: "Iv1.abc",
      clientSecret: "shhh",
      privateKey: CONVERSION.pem,
    });
  });

  test("stores the host selected in onboarding", () => {
    expect(
      toCredentialsInput(CONVERSION, "https://funnel.test", {
        url: "https://acme.ghe.com",
        api_url: "https://acme.ghe.com/api/v3",
      }),
    ).toMatchObject({
      githubUrl: "https://acme.ghe.com",
      githubApiUrl: "https://acme.ghe.com/api/v3",
    });
  });
});

describe("exchangeManifestCode", () => {
  test("POSTs the code to the conversions endpoint", async () => {
    let seen = "";
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      seen = String(url);
      expect((init as { method?: string }).method).toBe("POST");
      return Response.json(CONVERSION);
    }) as typeof fetch;

    const result = await exchangeManifestCode("temp code");
    expect(seen).toBe("https://api.github.com/app-manifests/temp%20code/conversions");
    expect(result.id).toBe(123);
  });

  test("throws a typed error when GitHub rejects the code", async () => {
    globalThis.fetch = (async (_url: unknown) =>
      new Response("bad code", { status: 422 })) as typeof fetch;
    await expect(exchangeManifestCode("nope")).rejects.toBeInstanceOf(
      ManifestExchangeError,
    );
  });

  test("follows the enterprise API base", async () => {
    setConfig(GHE_CONFIG);
    forge.resetCaches();
    let seen = "";
    globalThis.fetch = (async (url: unknown) => {
      seen = String(url);
      return Response.json(CONVERSION);
    }) as typeof fetch;

    await exchangeManifestCode("code");
    expect(seen).toBe(
      "https://acme.ghe.com/api/v3/app-manifests/code/conversions",
    );
  });
});

describe("installationUrl", () => {
  test("targets the configured web host", async () => {
    expect(await installationUrl("funnel-acme")).toBe(
      "https://github.com/apps/funnel-acme/installations/new",
    );
  });

  test("targets the configured GHES web host", async () => {
    setConfig(GHE_CONFIG);
    expect(await installationUrl("funnel-acme")).toBe(
      "https://acme.ghe.com/apps/funnel-acme/installations/new",
    );
  });
});

describe("installation listing", () => {
  test("lists App installations", async () => {
    globalThis.fetch = (async (url: unknown) => {
      expect(String(url)).toContain("/app/installations");
      return Response.json([
        { id: 7, account: { login: "acme", type: "Organization" } },
      ]);
    }) as typeof fetch;

    expect(await listInstallations()).toEqual([
      { id: 7, accountLogin: "acme", accountType: "Organization" },
    ]);
  });

  test("lists an installation's repositories", async () => {
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes("/access_tokens")) {
        return Response.json({
          token: "test-token",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        });
      }
      expect(u).toContain("/installation/repositories");
      return Response.json({
        total_count: 1,
        repositories: [
          {
            full_name: "acme/widgets",
            private: true,
            archived: false,
            html_url: "https://github.com/acme/widgets",
          },
        ],
      });
    }) as typeof fetch;

    expect(await listInstallationRepos(7)).toEqual([
      {
        fullName: "acme/widgets",
        private: true,
        archived: false,
        htmlUrl: "https://github.com/acme/widgets",
      },
    ]);
  });
});
