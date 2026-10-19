/**
 * The GitHub App credential store (SPEC §4, §8).
 *
 * Funnel's GitHub App is created through GitHub's App Manifest Flow during
 * `/onboarding`; this module is the single source of truth for its credentials.
 * There are no credential environment variables — everything (App id, client
 * id/secret, webhook secret, RSA private key, installation) lives in the
 * `state_github_app` row, with the secrets encrypted at rest.
 *
 * Reads are synchronous (bun:sqlite) and memoized for the process; a write
 * clears the cache so the very next request sees the new credentials. Callers
 * that own a derived cache (the Octokit App, Better Auth) must also reset it —
 * see {@link applyGithubCredentialsChanged}.
 */
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateGithubApp } from "#lib/server/db/schema";
import { decryptSecret, encryptSecret } from "#lib/server/crypto/secrets";

/** The `state_github_app` singleton row key. */
const SINGLETON_ID = "default";

/** Decrypted, ready-to-use App credentials. */
export interface GithubAppCredentials {
  appId: number;
  slug: string;
  name: string;
  ownerLogin: string;
  ownerType: string;
  htmlUrl: string;
  /** Public origin captured at creation; used for manifest/OAuth URLs. */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string | null;
  /** PEM-encoded RSA private key. */
  privateKey: string;
  installationId: number | null;
}

/** Input accepted when persisting the result of a manifest conversion. */
export interface ManifestCredentialsInput {
  appId: number;
  slug: string;
  name: string;
  ownerLogin: string;
  ownerType: string;
  htmlUrl: string;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string | null;
  privateKey: string;
}

let cached: GithubAppCredentials | null | undefined;

/** Raised when GitHub work is attempted before the App has been created. */
export class GithubAppUnconfiguredError extends Error {
  override name = "GithubAppUnconfiguredError";
  constructor() {
    super("No GitHub App configured; complete onboarding first.");
  }
}

/**
 * The configured GitHub App, or `null` when onboarding has not run yet.
 * Memoized; invalidated by every write in this module.
 */
export function getGithubCredentials(): GithubAppCredentials | null {
  if (cached !== undefined) return cached;
  const [row] = db.select().from(stateGithubApp).limit(1).all();
  if (!row) {
    cached = null;
    return cached;
  }
  cached = {
    appId: row.appId,
    slug: row.slug,
    name: row.name,
    ownerLogin: row.ownerLogin,
    ownerType: row.ownerType,
    htmlUrl: row.htmlUrl,
    baseUrl: row.baseUrl,
    clientId: row.clientId,
    clientSecret: decryptSecret(row.clientSecretEnc),
    webhookSecret: row.webhookSecretEnc
      ? decryptSecret(row.webhookSecretEnc)
      : null,
    privateKey: decryptSecret(row.privateKeyEnc),
    installationId: row.installationId,
  };
  return cached;
}

/** Whether onboarding has produced an App. */
export function hasGithubCredentials(): boolean {
  return getGithubCredentials() !== null;
}

/** Drop the memoized credentials (tests, or after an out-of-band write). */
export function resetGithubCredentialsCache(): void {
  cached = undefined;
}

/**
 * Persist the credentials returned by `POST /app-manifests/{code}/conversions`,
 * replacing any existing row. Secrets are encrypted before they are written.
 */
export function saveManifestCredentials(
  input: ManifestCredentialsInput,
): GithubAppCredentials {
  const now = Date.now();
  const values = {
    id: SINGLETON_ID,
    appId: input.appId,
    slug: input.slug,
    name: input.name,
    ownerLogin: input.ownerLogin,
    ownerType: input.ownerType,
    htmlUrl: input.htmlUrl,
    baseUrl: input.baseUrl,
    clientId: input.clientId,
    clientSecretEnc: encryptSecret(input.clientSecret),
    webhookSecretEnc: input.webhookSecret
      ? encryptSecret(input.webhookSecret)
      : null,
    privateKeyEnc: encryptSecret(input.privateKey),
    installationId: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(stateGithubApp)
    .values(values)
    .onConflictDoUpdate({
      target: stateGithubApp.id,
      set: {
        appId: values.appId,
        slug: values.slug,
        name: values.name,
        ownerLogin: values.ownerLogin,
        ownerType: values.ownerType,
        htmlUrl: values.htmlUrl,
        baseUrl: values.baseUrl,
        clientId: values.clientId,
        clientSecretEnc: values.clientSecretEnc,
        webhookSecretEnc: values.webhookSecretEnc,
        privateKeyEnc: values.privateKeyEnc,
        installationId: null,
        updatedAt: now,
      },
    })
    .run();
  resetGithubCredentialsCache();
  return getGithubCredentials()!;
}

/** Record the installation id returned by the install callback. */
export function setInstallationId(installationId: number): void {
  db.update(stateGithubApp)
    .set({ installationId, updatedAt: Date.now() })
    .where(eq(stateGithubApp.id, SINGLETON_ID))
    .run();
  resetGithubCredentialsCache();
}

/** Remove the App credentials (a hard reset back to onboarding). */
export function clearGithubCredentials(): void {
  db.delete(stateGithubApp).where(eq(stateGithubApp.id, SINGLETON_ID)).run();
  resetGithubCredentialsCache();
}
