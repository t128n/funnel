/**
 * `/settings/github-app` exposes the webhook state alongside the App metadata.
 * A missing secret is the expected state for Apps created before the receiver
 * existed, so the page must say so instead of implying webhooks work.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { seedTestGithubApp } from "#tests/github-app";
import { saveManifestCredentials } from "#lib/server/github/credentials";
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
  webhookConfigured: boolean;
  webhookUrl: string | null;
}

function runLoad(): Promise<LoadResult> {
  return load({
    locals: { user: ADMIN },
    url: SETTINGS_URL,
  } as never) as Promise<LoadResult>;
}

afterEach(async () => {
  await seedTestGithubApp();
});

describe("settings github app webhook state", () => {
  test("reports a configured webhook secret and endpoint", async () => {
    const data = await runLoad();
    expect(data.configured).toBe(true);
    expect(data.webhookConfigured).toBe(true);
    expect(data.webhookUrl).toBe(
      "http://localhost:5173/api/github/webhooks",
    );
  });

  test("reports an App created without a webhook secret", async () => {
    saveManifestCredentials({
      appId: 123456,
      slug: "funnel-test",
      name: "funnel-test",
      ownerLogin: "acme",
      ownerType: "Organization",
      htmlUrl: "https://github.com/apps/funnel-test",
      baseUrl: "https://funnel.example.com",
      clientId: "Iv1.0123456789abcdef",
      clientSecret: "0123456789abcdef0123456789abcdef01234567",
      webhookSecret: null,
      privateKey:
        "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----",
    });

    const data = await runLoad();
    expect(data.webhookConfigured).toBe(false);
    expect(data.webhookUrl).toBe(
      "https://funnel.example.com/api/github/webhooks",
    );
  });
});
