/**
 * Test fixture for the GitHub App credential store.
 *
 * With the App credentials living in the database (there are no credential
 * environment variables), tests need a real, seeded App. The RSA key is
 * generated with a real 2048-bit keypair so App JWT signing works offline
 * (tests stub `fetch` for the network itself).
 *
 * `tests/setup.ts` seeds this once for the whole run; a test that clears the
 * credentials must re-seed in its `afterEach` so later files keep working.
 */
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

/** The PEM private key used by the seeded test App. */
export const TEST_GITHUB_APP_PRIVATE_KEY = privateKey;

/** The client id existing tests assert against. */
export const TEST_GITHUB_APP_CLIENT_ID = "Iv1.0123456789abcdef";

/**
 * Persist the canonical test App. Optionally record an installation id.
 * Imports the store dynamically so the `$app/env/private` mock in
 * `tests/setup.ts` is applied first when this runs during preload.
 */
export async function seedTestGithubApp(installationId: number | null = null) {
  const { saveManifestCredentials } = await import(
    "#lib/server/github/credentials"
  );
  const saved = saveManifestCredentials({
    appId: 123456,
    slug: "funnel-test",
    name: "funnel-test",
    ownerLogin: "acme",
    ownerType: "Organization",
    htmlUrl: "https://github.com/apps/funnel-test",
    baseUrl: "http://localhost:5173",
    clientId: TEST_GITHUB_APP_CLIENT_ID,
    clientSecret: "0123456789abcdef0123456789abcdef01234567",
    privateKey,
  });
  if (installationId !== null) {
    const { setInstallationId } = await import("#lib/server/github/credentials");
    setInstallationId(installationId);
  } else {
    void saved;
  }
}
