import { App, Octokit } from "octokit";
import {
  GITHUB_APP_ID,
  GITHUB_APP_PRIVATE_KEY,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
} from "$app/env/private";

let app: App | undefined;

/** Shared GitHub App singleton. All credentials come from private env. */
export function getApp(): App {
  app ??= new App({
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY,
    oauth: { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET },
  });
  return app;
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
  const { data } = await getApp().octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    { owner, repo },
  );
  installationIdCache.set(key, data.id);
  return data.id;
}

/**
 * Map a failed `getInstallationId()` call to a client response.
 * Unknown repo / App not installed -> enriched 404, else forward status.
 */
export function installationErrorResponse(
  owner: string,
  repo: string,
  e: unknown,
): Response {
  const s = (e as { status?: unknown }).status;
  const status = typeof s === "number" ? s : 500;
  if (status === 404) {
    return Response.json(
      {
        message: "Not synced, open on GitHub",
        html_url: `https://github.com/${owner}/${repo}`,
      },
      { status: 404 },
    );
  }
  return Response.json({ message: "Upstream error" }, { status });
}
export const github = {
  /** App-level (JWT) client: manage the app itself, get installation URLs, etc. */
  app() {
    return getApp().octokit;
  },

  /** Installation-scoped client for server-to-server API calls. */
  asInstallation(installationId: number): Promise<InstallationOctokit> {
    return getApp().getInstallationOctokit(installationId);
  },

  /**
   * App-JWT client for non-installation endpoints (e.g. `GET
   * /users/{username}`). `app.octokit` itself defaults to installation
   * auth and throws without an ID, so mint the JWT explicitly.
   */
  async asApp(): Promise<Octokit> {
    const { token } = (await getApp().octokit.auth({ type: "app" })) as {
      token: string;
    };
    return new Octokit({ auth: token });
  },

  /** User-impersonating client for a user access token from the OAuth web flow. */
  asUser(token: string): Octokit {
    return new Octokit({ auth: token });
  },

  /** Start the OAuth web flow: redirect the user to the returned `url`. */
  getLoginUrl(options?: {
    redirectUrl?: string;
    state?: string;
    login?: string;
  }) {
    return getApp().oauth.getWebFlowAuthorizationUrl(options ?? {});
  },

  /** Exchange the `code` from the OAuth callback for a user token. Store the result. */
  async exchangeCode(code: string) {
    const { authentication } = await getApp().oauth.createToken({ code });
    return authentication;
  },

  /** Refresh an expiring user token (App user tokens expire after 8h). */
  async refreshUserToken(refreshToken: string) {
    const { authentication } = await getApp().oauth.refreshToken({
      refreshToken,
    });
    return authentication;
  },
};
