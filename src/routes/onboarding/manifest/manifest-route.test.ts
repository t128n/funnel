import { afterEach, describe, expect, test } from "bun:test";
import { resetConfigCache } from "#lib/server/config";
import { clearGithubCredentials } from "#lib/server/github/credentials";
import { seedTestGithubApp } from "#tests/github-app";
import { POST } from "./+server";

const MANIFEST_URL = "http://localhost:5173/onboarding/manifest";

function event(fields: Record<string, string>) {
  return {
    request: new Request(MANIFEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost:5173",
      },
      body: new URLSearchParams(fields),
    }),
    url: new URL(MANIFEST_URL),
    cookies: { set: () => undefined },
  };
}

afterEach(async () => {
  await seedTestGithubApp();
  resetConfigCache();
});

async function submit(fields: Record<string, string>): Promise<string> {
  clearGithubCredentials();
  resetConfigCache();
  const response = await POST(event(fields) as never);
  expect(response.status).toBe(200);
  return response.text();
}

describe("onboarding manifest route", () => {
  test("falls back to the configured host when the field is absent", async () => {
    const html = await submit({ account: "user", name: "funnel-smoke" });
    expect(html).toContain("https://github.com/settings/apps/new");
    expect(html).toContain("default_events");
    expect(html).not.toContain("hook_attributes");
  });

  test("posts to the GitHub Enterprise host entered in the wizard", async () => {
    const html = await submit({
      account: "user",
      name: "funnel-smoke",
      githubHost: "acme.ghe.com",
    });
    expect(html).toContain("https://acme.ghe.com/settings/apps/new");
  });
});
