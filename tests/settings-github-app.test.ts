/**
 * `/settings/github-app` exposes the stored App metadata and install URL.
 * Polling is the only sync path, so the page no longer has any webhook state
 * to report.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { seedTestGithubApp } from "#tests/github-app";
import { resetConfigCache } from "#lib/server/config";
import {
  clearGithubCredentials,
  saveManifestCredentials,
} from "#lib/server/github/credentials";
import { load } from "#/routes/(app)/settings/github-app/+page.server";

const ADMIN = {
  id: "admin",
  name: "Admin",
  email: "admin@example.com",
  image: null,
  role: "admin" as const,
};

const SETTINGS_URL = new URL("http://localhost/settings/github-app");

interface LoadResult {
  configured: boolean;
  credentials: {
    name: string;
    githubUrl: string;
    installationId: number | null;
  } | null;
  installUrl: string | null;
}

function runLoad(): Promise<LoadResult> {
  return load({
    locals: { user: ADMIN },
    url: SETTINGS_URL,
  } as never) as Promise<LoadResult>;
}

afterEach(async () => {
  await seedTestGithubApp();
  resetConfigCache();
});

describe("settings github app", () => {
  test("reports the stored App metadata and install URL", async () => {
    const data = await runLoad();
    expect(data.configured).toBe(true);
    expect(data.credentials?.name).toBe("funnel-test");
    expect(data.installUrl).toBe(
      "https://github.com/apps/funnel-test/installations/new",
    );
  });

  test("reports the GitHub Enterprise host stored with the App", async () => {
    saveManifestCredentials({
      appId: 123456,
      slug: "funnel-test",
      name: "funnel-test",
      ownerLogin: "acme",
      ownerType: "Organization",
      htmlUrl: "https://acme.ghe.com/settings/apps/funnel-test",
      baseUrl: "https://funnel.example.com",
      githubUrl: "https://acme.ghe.com",
      githubApiUrl: "https://acme.ghe.com/api/v3",
      clientId: "Iv1.0123456789abcdef",
      clientSecret: "0123456789abcdef0123456789abcdef01234567",
      privateKey:
        "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----",
    });

    const data = await runLoad();
    expect(data.credentials?.githubUrl).toBe("https://acme.ghe.com");
  });

  test("reports an unconfigured instance", async () => {
    clearGithubCredentials();
    const data = await runLoad();
    expect(data.configured).toBe(false);
    expect(data.credentials).toBeNull();
    expect(data.installUrl).toBeNull();
  });
});
