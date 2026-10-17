import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getInstallationId,
  github,
  installationErrorResponse,
  resetAppCache,
} from "./app.server";
import { setConfig } from "#/lib/server/config";
import { GHE_CONFIG, TEST_CONFIG } from "#tests/test-config";

const realFetch = globalThis.fetch;

beforeEach(() => {
  setConfig(TEST_CONFIG);
  resetAppCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  resetAppCache();
});

describe("installationErrorResponse", () => {
  test("404 becomes enriched not-synced response", async () => {
    const res = await installationErrorResponse("o", "r", { status: 404 });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      message: "Not synced, open on GitHub",
      html_url: "https://github.com/o/r",
    });
  });

  test("404 html_url follows the configured github.url", async () => {
    setConfig(GHE_CONFIG);
    const res = await installationErrorResponse("o", "r", { status: 404 });
    expect(await res.json()).toEqual({
      message: "Not synced, open on GitHub",
      html_url: "https://acme.ghe.com/o/r",
    });
  });

  test("other statuses forward, unknown errors become 500", async () => {
    const limited = await installationErrorResponse("o", "r", { status: 403 });
    expect(limited.status).toBe(403);
    expect(await limited.json()).toEqual({ message: "Upstream error" });

    const broken = await installationErrorResponse("o", "r", new Error("boom"));
    expect(broken.status).toBe(500);
  });
});

describe("getInstallationId", () => {
  test("resolves and caches per repo (case-insensitive)", async () => {
    let calls = 0;
    globalThis.fetch = (async (url: unknown) => {
      calls++;
      expect(String(url)).toContain("/repos/acme/widgets/installation");
      return Response.json({ id: 777 });
    }) as typeof fetch;

    expect(await getInstallationId("acme", "widgets")).toBe(777);
    expect(await getInstallationId("ACME", "WIDGETS")).toBe(777);
    expect(calls).toBe(1);
  });

  test("enterprise config targets the api/v3 base", async () => {
    setConfig(GHE_CONFIG);
    resetAppCache();
    let seen = "";
    globalThis.fetch = (async (url: unknown) => {
      seen = String(url);
      return Response.json({ id: 4242 });
    }) as typeof fetch;

    expect(await getInstallationId("acme-ent", "widgets")).toBe(4242);
    expect(seen).toContain(
      "https://acme.ghe.com/api/v3/repos/acme-ent/widgets/installation",
    );
  });
});

describe("github clients", () => {
  test("asUser and asApp return request-capable clients", async () => {
    expect(typeof (await github.asUser("token")).request).toBe("function");
    expect(typeof (await github.asApp()).request).toBe("function");
    expect(typeof (await github.app()).request).toBe("function");
  });

  test("getLoginUrl builds a URL with the client id", async () => {
    const { url } = await github.getLoginUrl({ redirectUrl: "http://x/cb" });
    expect(url).toContain("Iv1.0123456789abcdef");
  });

  test("exchangeCode and refreshUserToken return authentications", async () => {
    globalThis.fetch = (async (url: unknown) => {
      expect(String(url)).toContain("login/oauth/access_token");
      return Response.json(
        {
          access_token: "ghu_x",
          expires_in: "28800",
          refresh_token: "ghr_y",
          refresh_token_expires_in: "17592000",
          scope: "",
          token_type: "bearer",
        },
        { headers: { date: new Date().toUTCString() } },
      );
    }) as typeof fetch;

    const created = await github.exchangeCode("code123");
    expect(created.token).toBe("ghu_x");
    expect(created.refreshToken).toBe("ghr_y");
    const refreshed = await github.refreshUserToken("ghr_y");
    expect(refreshed.token).toBe("ghu_x");
  });
});

describe("GraphQL endpoint follows github.api_url", () => {
  test("Cloud targets api.github.com/graphql", async () => {
    let seen = "";
    globalThis.fetch = (async (url: unknown) => {
      seen = String(url);
      return Response.json({ data: { viewer: { login: "octocat" } } });
    }) as typeof fetch;

    const data = await (await github.asApp()).graphql(
      "query { viewer { login } }",
    );
    expect(data).toEqual({ viewer: { login: "octocat" } });
    expect(seen).toBe("https://api.github.com/graphql");
  });

  test("enterprise targets api/graphql, not api/v3/graphql", async () => {
    setConfig(GHE_CONFIG);
    resetAppCache();
    let seen = "";
    globalThis.fetch = (async (url: unknown) => {
      seen = String(url);
      return Response.json({ data: {} });
    }) as typeof fetch;

    await (await github.asApp()).graphql("query { viewer { login } }");
    expect(seen).toBe("https://acme.ghe.com/api/graphql");
    expect(seen).not.toContain("/api/v3/graphql");
  });

  test("installation helper hits the same endpoint", async () => {
    setConfig(GHE_CONFIG);
    resetAppCache();
    const seen: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      seen.push(u);
      if (u.includes("/access_tokens")) {
        return Response.json({
          token: "test-token",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        });
      }
      return Response.json({ data: { repository: { id: "R_1" } } });
    }) as typeof fetch;

    const gql = await github.graphql(7);
    const data = await gql("query { repository { id } }");
    expect(data).toEqual({ repository: { id: "R_1" } });
    expect(seen).toContain("https://acme.ghe.com/api/graphql");
  });

  test("asUser targets the configured api_url", async () => {
    setConfig(GHE_CONFIG);
    resetAppCache();
    let seen = "";
    globalThis.fetch = (async (url: unknown) => {
      seen = String(url);
      return Response.json({ login: "octocat" });
    }) as typeof fetch;

    await (await github.asUser("token")).request("GET /user");
    expect(seen).toBe("https://acme.ghe.com/api/v3/user");
  });
});

// The write helpers stay reachable through the public surface.
test("write helpers are reachable via github object", () => {
  expect(typeof github.exchangeCode).toBe("function");
  expect(typeof github.refreshUserToken).toBe("function");
});
