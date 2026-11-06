/**
 * GitHub host selection for onboarding.
 *
 * The App Manifest Flow targets one GitHub deployment: github.com or a GitHub
 * Enterprise Server host. The wizard accepts either form (`acme.ghe.com` or
 * `https://acme.ghe.com`) and this module normalizes it into the pair every
 * other GitHub integration expects: the web host (`url`) and the REST base
 * (`api_url`).
 *
 * Kept pure (no config/env/network) so the wizard's host parser is unit-testable
 * without a database or a live GitHub host.
 */

/** The GitHub Cloud host pair used when no explicit host is configured. */
export const GITHUB_CLOUD_HOSTS = {
  url: "https://github.com",
  api_url: "https://api.github.com",
} as const;

/** A GitHub web host plus the REST API base that belongs with it. */
export interface GithubHosts {
  /** Web host, e.g. `https://github.com` or `https://acme.ghe.com`. */
  url: string;
  /** REST base, e.g. `https://api.github.com` or `https://acme.ghe.com/api/v3`. */
  api_url: string;
}

/** Raised when the onboarding form carries a host Funnel cannot use. */
export class GithubHostError extends Error {
  override name = "GithubHostError";
}

/**
 * Normalize a user-entered GitHub host.
 *
 * Accepts a bare host (`acme.ghe.com`), a web URL (`https://acme.ghe.com`), or
 * a GHES API URL (`https://acme.ghe.com/api/v3`). github.com always maps to the
 * Cloud API (`api.github.com`); every other host maps to GHES's `/api/v3`.
 * A missing scheme defaults to HTTPS, but an explicit `http://` is preserved so
 * a local GHES development instance can still be used.
 */
export function normalizeGithubHost(value: string): GithubHosts {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new GithubHostError("Enter a GitHub host.");
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    throw new GithubHostError(
      "Enter a valid GitHub host, for example github.com or acme.ghe.com.",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new GithubHostError("GitHub host must use http:// or https://.");
  }
  if (url.username || url.password) {
    throw new GithubHostError("GitHub host must not include credentials.");
  }
  if (url.search || url.hash) {
    throw new GithubHostError("GitHub host must not include a query or fragment.");
  }

  // Tolerate someone pasting the GHES API base from the documentation.
  const path = url.pathname.replace(/\/+$/, "");
  if (path && path !== "/api/v3") {
    throw new GithubHostError(
      "GitHub host must be the web host, for example https://acme.ghe.com.",
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "github.com" || hostname === "www.github.com") {
    return { ...GITHUB_CLOUD_HOSTS };
  }

  const web = `${url.protocol}//${url.host}`;
  return { url: web, api_url: `${web}/api/v3` };
}

/** Whether a normalized host is GitHub Cloud rather than an enterprise host. */
export function isGithubCloud(hosts: Pick<GithubHosts, "url">): boolean {
  try {
    const hostname = new URL(hosts.url).hostname.toLowerCase();
    return hostname === "github.com" || hostname === "www.github.com";
  } catch {
    return true;
  }
}
