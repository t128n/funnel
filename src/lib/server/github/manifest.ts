/**
 * GitHub App Manifest Flow helpers (SPEC §4).
 *
 * GitHub lets an app be created programmatically by POSTing a JSON "manifest"
 * from a plain HTML form to `/{settings|organizations/:org/settings}/apps/new`.
 * GitHub then shows the user a pre-filled registration screen, and on approval
 * redirects back to our `redirect_url` with a temporary conversion code that
 * `POST /app-manifests/{code}/conversions` exchanges for the real credentials.
 *
 * This module is pure (no config/env/network) so the manifest shape, the form
 * target, and the auto-submitting HTML can be unit-tested directly.
 */

/** GitHub App permissions Funnel needs, mapped to their required level. */
export const MANIFEST_PERMISSIONS = {
  // Create/patch issues, comments, labels, and assignees (SPEC §5, §9).
  issues: "write",
  // Read repository metadata / installation scope.
  metadata: "read",
  // Read repository contents (issues reference code; keeps clone-based flows open).
  contents: "read",
  // Read linked pull requests, reviews, and the issues they close (#28).
  pull_requests: "read",
  // Read the head commit's check runs and statuses (#28).
  checks: "read",
} as const;

export interface ManifestUrls {
  /** Public homepage of the instance, e.g. `https://funnel.example.com`. */
  baseUrl: string;
  /** Where the OAuth sign-in callback lives; usually `{baseUrl}/api/auth/callback/github`. */
  callbackUrl: string;
  /** Where GitHub redirects after creation (carries the conversion `code`). */
  redirectUrl: string;
  /** Where GitHub redirects after installation (carries `installation_id`). */
  setupUrl: string;
}

export interface GithubAppManifest {
  name: string;
  url: string;
  redirect_url: string;
  callback_urls: string[];
  setup_url: string;
  public: false;
  default_permissions: Record<string, string>;
  /**
   * Funnel is polling-only. The manifest deliberately subscribes to no events
   * and registers no hook, so GitHub never needs an inbound connection to the
   * server.
   */
  default_events: string[];
}

/** Build the manifest JSON object for a new App. */
export function buildManifest(
  name: string,
  urls: ManifestUrls,
): GithubAppManifest {
  return {
    name,
    url: urls.baseUrl,
    redirect_url: urls.redirectUrl,
    callback_urls: [urls.callbackUrl],
    setup_url: urls.setupUrl,
    public: false,
    default_permissions: { ...MANIFEST_PERMISSIONS },
    default_events: [],
  };
}

/** Where the browser must POST the manifest, by account type. */
export function manifestFormAction(
  githubUrl: string,
  account:
    | { type: "user" }
    | { type: "organization"; org: string },
): string {
  const base = githubUrl.replace(/\/$/, "");
  if (account.type === "organization") {
    return `${base}/organizations/${encodeURIComponent(account.org)}/settings/apps/new`;
  }
  return `${base}/settings/apps/new`;
}

/** Escape a value for a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The self-submitting page that hands the manifest off to GitHub. GitHub only
 * accepts the manifest from a real form POST (a `fetch` would be blocked by
 * CORS), so the server returns this HTML and the browser continues the flow.
 */
export function buildManifestFormHtml(
  action: string,
  manifest: GithubAppManifest,
  state: string,
): string {
  const manifestJson = escapeAttribute(JSON.stringify(manifest));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Creating GitHub App…</title>
  </head>
  <body>
    <form method="post" action="${escapeAttribute(action)}">
      <input type="hidden" name="manifest" value="${manifestJson}" />
      <input type="hidden" name="state" value="${escapeAttribute(state)}" />
      <noscript>
        <p>JavaScript is disabled. Submit the form to continue creating the app.</p>
        <button type="submit">Continue to GitHub</button>
      </noscript>
    </form>
    <script>document.forms[0].submit();</script>
  </body>
</html>`;
}
