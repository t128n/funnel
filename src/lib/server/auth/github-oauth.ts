/**
 * GitHub OAuth for GitHub Enterprise Server.
 *
 * Better Auth's built-in `github` provider hardcodes github.com's OAuth and
 * user endpoints, so it cannot sign a user in to a GHES instance. The generic
 * OAuth plugin accepts explicit endpoints; this module supplies GHES's
 * `/login/oauth/*` URLs and maps the GitHub profile (including the email
 * fallback) the same way the built-in provider does.
 */
import type { OAuth2Tokens } from "better-auth/oauth2";
import type {
  GenericOAuthConfig,
  GenericOAuthUserInfo,
} from "better-auth/plugins/generic-oauth";
import type { GithubHosts } from "#lib/server/github/hosts";

interface GithubProfile {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

async function githubGet<T>(url: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "funnel",
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Build a Better Auth generic-OAuth config for a GHES host. */
export function githubEnterpriseOAuth(options: {
  hosts: GithubHosts;
  clientId: string;
  clientSecret: string;
}): GenericOAuthConfig<"github"> {
  const web = options.hosts.url.replace(/\/$/, "");
  const api = options.hosts.api_url.replace(/\/$/, "");

  return {
    providerId: "github",
    name: "GitHub",
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorizationUrl: `${web}/login/oauth/authorize`,
    tokenUrl: `${web}/login/oauth/access_token`,
    userInfoUrl: `${api}/user`,
    scopes: ["read:user", "repo"],
    accountSubject: ({ profile }) => String(profile.id ?? ""),
    async getUserInfo(tokens: OAuth2Tokens) {
      const token = tokens.accessToken;
      if (!token) return null;
      const profile = await githubGet<GithubProfile>(`${api}/user`, token);
      if (!profile) return null;

      let email = profile.email ?? null;
      let emailVerified = false;
      if (!email) {
        const emails = await githubGet<GithubEmail[]>(
          `${api}/user/emails`,
          token,
        );
        const primary = emails?.find((entry) => entry.primary) ?? emails?.[0];
        email = primary?.email ?? null;
        emailVerified = primary?.verified ?? false;
      } else {
        const emails = await githubGet<GithubEmail[]>(
          `${api}/user/emails`,
          token,
        );
        emailVerified =
          emails?.find((entry) => entry.email === email)?.verified ?? false;
      }

      return {
        id: profile.id,
        name: profile.name || profile.login || "",
        email,
        emailVerified,
        image: profile.avatar_url,
      } satisfies GenericOAuthUserInfo;
    },
  };
}
