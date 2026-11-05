import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import { TEST_CONFIG, GHE_CONFIG } from "#tests/test-config";
import { seedTestGithubApp } from "#tests/github-app";
import { forge } from "./providers.server";

const realFetch = globalThis.fetch;
let calls: Array<{
  url: string;
  method: string;
  auth: string | null;
  body: string | null;
}> = [];

beforeEach(async () => {
  setConfig(TEST_CONFIG);
  forge.resetCaches();
  calls = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    const body = init?.body;
    calls.push({
      url,
      method: init?.method ?? "GET",
      auth: new Headers(init?.headers).get("authorization"),
      body: typeof body === "string" ? body : null,
    });
    if (url.endsWith("/access_tokens")) return Response.json({ token: "ghs_test", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    if (url.endsWith("/graphql")) return Response.json({ data: { viewer: { login: "acme" } } });
    if (url.includes("/repos/acme/widgets/installation")) return Response.json({ id: 4242 });
    if (url.includes("/repos/acme/widgets")) return Response.json({ id: 7, full_name: "acme/widgets", name: "widgets", owner: { login: "acme" }, visibility: "private" });
    return Response.json({});
  }) as typeof fetch;
  await seedTestGithubApp(4242);
});
afterEach(() => { globalThis.fetch = realFetch; forge.resetCaches(); });

describe("refs and links", () => {
  test("refs carry the configured instance", () => {
    expect(forge.repoRef("acme", "widgets")).toEqual({ forge: "github", instance: "github.com", owner: "acme", name: "widgets" });
    const ref = forge.threadRef(forge.repoRef("acme", "widgets"), "issue", 42);
    expect(ref.kind).toBe("issue");
    expect(ref.number).toBe("42");
    expect(ref.repo.owner).toBe("acme");
    expect(ref.repo.instance).toBe("github.com");
  });
  test("webUrl joins the web origin", async () => {
    expect(await forge.webUrl("/acme/widgets")).toBe("https://github.com/acme/widgets");
  });
});

describe("providers", () => {
  test("userProvider sends the token", async () => {
    await forge.userProvider("ghp_test").repos.get(forge.repoRef("acme", "widgets"));
    expect(calls.at(-1)?.url).toBe("https://api.github.com/repos/acme/widgets");
    expect(calls.at(-1)?.auth).toBe("Bearer ghp_test");
  });
  test("installationProvider mints and uses an installation token", async () => {
    await (await forge.installationProvider(4242)).repos.get(forge.repoRef("acme", "widgets"));
    expect(calls.some((c) => c.url.endsWith("/app/installations/4242/access_tokens"))).toBe(true);
    expect(calls.at(-1)?.auth).toBe("Bearer ghs_test");
  });
  test("getInstallationId caches the lookup", async () => {
    expect(await forge.getInstallationId("acme", "widgets")).toBe(4242);
    expect(await forge.getInstallationId("acme", "widgets")).toBe(4242);
    expect(calls.filter((c) => c.url.includes("/installation")).length).toBe(1);
  });
  test("GHES host becomes the instance", async () => {
    setConfig(GHE_CONFIG);
    forge.resetCaches();
    expect(forge.repoRef("acme", "widgets").instance).toBe("acme.ghe.com");
    expect(await forge.webUrl("/acme/widgets")).toBe("https://acme.ghe.com/acme/widgets");
  });
});

describe("REST endpoint derivation", () => {
  test("Cloud keeps api.github.com", async () => {
    await (await forge.installationProvider(4242)).repos.get(
      forge.repoRef("acme", "widgets"),
    );
    expect(calls.at(-1)?.url).toBe("https://api.github.com/repos/acme/widgets");
  });

  test("GHES installation provider targets /api/v3", async () => {
    setConfig(GHE_CONFIG);
    forge.resetCaches();

    const provider = await forge.installationProvider(4242);
    await provider.repos.get(forge.repoRef("acme", "widgets"));

    expect(calls).toContainEqual(
      expect.objectContaining({
        url: "https://acme.ghe.com/api/v3/repos/acme/widgets",
        method: "GET",
        auth: "Bearer ghs_test",
      }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        url: "https://acme.ghe.com/api/v3/app/installations/4242/access_tokens",
        method: "POST",
      }),
    );
    expect(calls.some((c) => c.url.startsWith("https://api.github.com"))).toBe(
      false,
    );
  });
});

describe("GraphQL endpoint derivation", () => {
  const query = "query Viewer { viewer { login } }";

  test("Cloud posts to api.github.com/graphql", async () => {
    const provider = await forge.installationProvider(4242);
    const data = await provider.graphql(query);

    expect(data).toEqual({ viewer: { login: "acme" } });
    const call = calls.find((c) => c.url.includes("/graphql"));
    expect(call).toMatchObject({
      url: "https://api.github.com/graphql",
      method: "POST",
      auth: "Bearer ghs_test",
    });
    expect(JSON.parse(call!.body!)).toEqual({
      query,
      variables: {},
      operationName: "Viewer",
    });
  });

  test("GHES rewrites /api/v3 to /api/graphql", async () => {
    setConfig(GHE_CONFIG);
    forge.resetCaches();

    const provider = await forge.installationProvider(4242);
    await provider.graphql(query);

    const call = calls.find((c) => c.url.includes("/graphql"));
    expect(call).toMatchObject({
      url: "https://acme.ghe.com/api/graphql",
      method: "POST",
      auth: "Bearer ghs_test",
    });
    expect(JSON.parse(call!.body!)).toEqual({
      query,
      variables: {},
      operationName: "Viewer",
    });
    expect(calls.every((c) => !c.url.startsWith("https://api.github.com"))).toBe(
      true,
    );
  });
});
