import { App, Octokit } from "octokit";
import {
  GITHUB_APP_ID,
  GITHUB_APP_PRIVATE_KEY,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
} from "$app/env/private";
import { getConfig } from "#/lib/server/config";

let appPromise: Promise<App> | undefined;

/**
 * Build the shared GitHub App. Every REST/JWT/installation call derives its
 * host from `github.api_url`, so the same code targets github.com or an
 * enterprise instance (`https://acme.ghe.com/api/v3`). The same `baseUrl` also
 * drives GraphQL: `@octokit/graphql` rewrites a trailing `/api/v3` to
 * `/api/graphql`, so enterprise instances resolve `acme.ghe.com/api/graphql`
 * while Cloud resolves `api.github.com/graphql`. `@octokit/app` has no
 * top-level `baseUrl`, so we hand it a pre-defaulted Octokit class; it reuses
 * that class for installation clients (via `auth.octokit.constructor`) and for
 * its OAuth app.
 */
async function createApp(): Promise<App> {
  const { github: hosts } = await getConfig();
  const HostOctokit = Octokit.defaults({ baseUrl: hosts.api_url });
  return new App({
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY,
    oauth: { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET },
    Octokit: HostOctokit,
  });
}

/**
 * Shared GitHub App singleton. Credentials come from private env, the host
 * from `github.api_url` (config). Memoized, and re-armed on failure so a
 * transient config error does not poison the process.
 */
export function getApp(): Promise<App> {
  return (appPromise ??= createApp().catch((error) => {
    appPromise = undefined;
    throw error;
  }));
}

/** Drop the cached App (for tests, or after a config reload). */
export function resetAppCache(): void {
  appPromise = undefined;
}

export type InstallationOctokit = Awaited<
  ReturnType<App["getInstallationOctokit"]>
>;
export type UserOctokit = Octokit;

const installationIdCache = new Map<string, number>();

/**
 * Resolve `owner/repo` to its installation ID via the App JWT client.
 * Cached in memory; installations change rarely (install/uninstall).
 */
export async function getInstallationId(
  owner: string,
  repo: string,
): Promise<number> {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const cached = installationIdCache.get(key);
  if (cached !== undefined) return cached;
  const { data } = await (await getApp()).octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    { owner, repo },
  );
  installationIdCache.set(key, data.id);
  return data.id;
}

/**
 * Absolute web URL for a path (issue, label, profile) on the configured
 * instance. `github.url` supplies the host, so enterprise deployments emit
 * `https://acme.ghe.com/...` instead of github.com links.
 */
export async function webUrl(path: string): Promise<string> {
  const { github: hosts } = await getConfig();
  return `${hosts.url.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/**
 * Map a failed `getInstallationId()` call to a client response.
 * Unknown repo / App not installed -> enriched 404, else forward status.
 * The 404 link resolves against `github.url`, so enterprise instances point
 * at `https://acme.ghe.com/<owner>/<repo>` rather than github.com.
 */
export async function installationErrorResponse(
  owner: string,
  repo: string,
  e: unknown,
): Promise<Response> {
  const s = (e as { status?: unknown }).status;
  const status = typeof s === "number" ? s : 500;
  if (status === 404) {
    return Response.json(
      {
        message: "Not synced, open on GitHub",
        html_url: await webUrl(`${owner}/${repo}`),
      },
      { status: 404 },
    );
  }
  return Response.json({ message: "Upstream error" }, { status });
}
export const github = {
  /** App-level (JWT) client: manage the app itself, get installation URLs, etc. */
  async app(): Promise<Octokit> {
    return (await getApp()).octokit;
  },

  /** Installation-scoped client for server-to-server API calls. */
  async asInstallation(installationId: number): Promise<InstallationOctokit> {
    return (await getApp()).getInstallationOctokit(installationId);
  },

  /**
   * App-JWT client for non-installation endpoints (e.g. `GET
   * /users/{username}`). `app.octokit` itself defaults to installation
   * auth and throws without an ID, so mint the JWT explicitly.
   */
  async asApp(): Promise<Octokit> {
    const app = await getApp();
    const { token } = (await app.octokit.auth({ type: "app" })) as {
      token: string;
    };
    const { github: hosts } = await getConfig();
    return new Octokit({ auth: token, baseUrl: hosts.api_url });
  },

  /**
   * Installation-token GraphQL client for batched hydration. The endpoint
   * derives from `github.api_url`: `@octokit/graphql` rewrites a trailing
   * `/api/v3` to `/api/graphql`, so enterprise instances hit
   * `acme.ghe.com/api/graphql` (never `.../api/v3/graphql`).
   */
  async graphql(
    installationId: number,
  ): Promise<InstallationOctokit["graphql"]> {
    return (await this.asInstallation(installationId)).graphql;
  },

  /** User-impersonating client for a user access token from the OAuth web flow. */
  async asUser(token: string): Promise<Octokit> {
    const { github: hosts } = await getConfig();
    return new Octokit({ auth: token, baseUrl: hosts.api_url });
  },

  /** Start the OAuth web flow: redirect the user to the returned `url`. */
  async getLoginUrl(options?: {
    redirectUrl?: string;
    state?: string;
    login?: string;
  }) {
    return (await getApp()).oauth.getWebFlowAuthorizationUrl(options ?? {});
  },

  /** Exchange the `code` from the OAuth callback for a user token. Store the result. */
  async exchangeCode(code: string) {
    const { authentication } = await (
      await getApp()
    ).oauth.createToken({ code });
    return authentication;
  },

  /** Refresh an expiring user token (App user tokens expire after 8h). */
  async refreshUserToken(refreshToken: string) {
    const { authentication } = await (
      await getApp()
    ).oauth.refreshToken({
      refreshToken,
    });
    return authentication;
  },
};
