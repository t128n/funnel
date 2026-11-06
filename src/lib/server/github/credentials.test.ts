import { afterEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import { stateGithubApp } from "#lib/server/db/schema";
import { seedTestGithubApp } from "#tests/github-app";
import {
  clearGithubCredentials,
  getGithubCredentials,
  saveManifestCredentials,
  setInstallationId,
} from "./credentials";

afterEach(async () => {
  // These tests mutate the singleton row; restore it for later files.
  await seedTestGithubApp();
});

describe("github app credentials", () => {
  test("resolves the seeded app with decrypted secrets", () => {
    const credentials = getGithubCredentials();
    expect(credentials).not.toBeNull();
    expect(credentials!.appId).toBe(123456);
    expect(credentials!.clientId).toBe("Iv1.0123456789abcdef");
    expect(credentials!.clientSecret).toBe(
      "0123456789abcdef0123456789abcdef01234567",
    );
    expect(credentials!.privateKey).toContain("BEGIN");
  });

  test("stores secrets encrypted at rest", () => {
    const [row] = db.select().from(stateGithubApp).all();
    expect(row.clientSecretEnc).not.toContain("0123456789abcdef");
    expect(row.privateKeyEnc).not.toContain("BEGIN");
    expect(row.clientSecretEnc.split(":")).toHaveLength(3);
  });

  test("clear removes the row and reports unconfigured", () => {
    clearGithubCredentials();
    expect(getGithubCredentials()).toBeNull();
  });

  test("saveManifestCredentials replaces existing credentials", () => {
    const saved = saveManifestCredentials({
      appId: 999,
      slug: "funnel-replaced",
      name: "funnel-replaced",
      ownerLogin: "octocat",
      ownerType: "User",
      htmlUrl: "https://github.com/apps/funnel-replaced",
      baseUrl: "https://funnel.test",
      clientId: "Iv23.replaced",
      clientSecret: "s".repeat(40),
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----",
    });
    expect(saved.appId).toBe(999);
    expect(saved.installationId).toBeNull();
    expect(getGithubCredentials()!.slug).toBe("funnel-replaced");
  });

  test("setInstallationId records the installation", () => {
    setInstallationId(4242);
    expect(getGithubCredentials()!.installationId).toBe(4242);
  });
});
