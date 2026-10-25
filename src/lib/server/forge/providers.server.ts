/**
 * Provider layer for `forges`.
 *
 * This is the only place that constructs a `forges` GitHub provider. GitHub
 * App credentials come from the `state_github_app` row; the API base and the
 * instance host come from `getConfig().github` (`api_url` and `url`), so the
 * same code targets github.com and a GitHub Enterprise Server instance.
 */
import { GITHUB_API_URL, GITHUB_URL } from "$app/env/private";
import type { RepoRef, ThreadKind, ThreadRef } from "forges";
import { github } from "forges/github";
import type { GitHubProvider } from "forges/github";
import { type FunnelConfig, getConfig } from "#/lib/server/config";
import {
	getGithubCredentials,
	GithubAppUnconfiguredError,
} from "#/lib/server/github/credentials";
import { demoProvider } from "#lib/server/demo/provider";
import { isDemoMode } from "#lib/server/demo/mode";

export type { GitHubProvider, RepoRef, ThreadKind, ThreadRef };

interface Hosts {
	/** GitHub API base, e.g. `https://api.github.com` or `https://acme.ghe.com/api/v3`. */
	baseUrl: string;
	/** Web host used in refs and links, e.g. `github.com` or `acme.ghe.com`. */
	instance: string;
}

function hostsFrom(github: FunnelConfig["github"]): Hosts {
	return {
		baseUrl: github.api_url,
		instance: new URL(github.url).host,
	};
}

async function currentHosts(): Promise<Hosts> {
	const { github: hosts } = await getConfig();
	return hostsFrom(hosts);
}

/**
 * Read the cached config without awaiting. `getConfig()` is the only accessor
 * and it is asynchronous, while `repoRef()` and `userProvider()` are
 * synchronous. When the promise is already settled (the normal case, and every
 * test using `setConfig()`), `Bun.peek()` returns its value. On the very first
 * production call the config load is still pending, so fall back to the env
 * hosts: `loadFunnelConfig()` derives `github.url`/`github.api_url` from the
 * same environment values and nothing else.
 */
function syncHosts(): Hosts {
	const pending = getConfig();
	const settled = Bun.peek(pending);
	if (settled !== pending) return hostsFrom((settled as FunnelConfig).github);
	return {
		baseUrl: GITHUB_API_URL,
		instance: new URL(GITHUB_URL).host,
	};
}

function appAuth(): {
	type: "app";
	appId: number;
	privateKey: string;
} {
	const credentials = getGithubCredentials();
	if (!credentials) throw new GithubAppUnconfiguredError();
	return {
		type: "app",
		appId: credentials.appId,
		privateKey: credentials.privateKey,
	};
}

async function createAppProvider(): Promise<GitHubProvider> {
	const auth = appAuth();
	const { baseUrl, instance } = await currentHosts();
	return github({ baseUrl, instance, auth });
}

async function createInstallationProvider(
	id: number,
): Promise<GitHubProvider> {
	const auth = { ...appAuth(), installationId: id };
	const { baseUrl, instance } = await currentHosts();
	return github({ baseUrl, instance, auth });
}

let appProviderPromise: Promise<GitHubProvider> | undefined;
const installationProviders = new Map<number, Promise<GitHubProvider>>();
const installationIds = new Map<string, number>();

export interface Forge {
	/** GitHub App (JWT) provider, with no installation. */
	appProvider(): Promise<GitHubProvider>;
	/** Provider acting as one installation, cached per id. */
	installationProvider(id: number): Promise<GitHubProvider>;
	/** Provider acting as a user access token. */
	userProvider(token: string): GitHubProvider;
	/** Resolve `owner/repo` to its installation id, cached per repo. */
	getInstallationId(owner: string, repo: string): Promise<number>;
	repoRef(owner: string, name: string): RepoRef;
	threadRef(repo: RepoRef, kind: ThreadKind, number: number): ThreadRef;
	/** Origin of the configured web instance, without a trailing slash. */
	webOrigin(): Promise<string>;
	/** Absolute web URL for a path on the configured instance. */
	webUrl(path: string): Promise<string>;
	/** Drop the provider and installation-id caches. */
	resetCaches(): void;
}

export const forge: Forge = {
	appProvider(): Promise<GitHubProvider> {
		if (isDemoMode()) return Promise.resolve(demoProvider());
		return (appProviderPromise ??= createAppProvider().catch((error) => {
			appProviderPromise = undefined;
			throw error;
		}));
	},

	installationProvider(id: number): Promise<GitHubProvider> {
		if (isDemoMode()) return Promise.resolve(demoProvider());
		const cached = installationProviders.get(id);
		if (cached) return cached;
		const created = createInstallationProvider(id);
		installationProviders.set(id, created);
		void created.catch(() => {
			if (installationProviders.get(id) === created) {
				installationProviders.delete(id);
			}
		});
		return created;
	},

	userProvider(token: string): GitHubProvider {
		if (isDemoMode()) return demoProvider();
		const { baseUrl, instance } = syncHosts();
		return github({ baseUrl, instance, auth: { type: "token", token } });
	},

	async getInstallationId(owner: string, repo: string): Promise<number> {
		if (isDemoMode()) return 1;
		const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
		const cached = installationIds.get(key);
		if (cached !== undefined) return cached;
		const { data } = await (
			await forge.appProvider()
		).request<{ id?: number }>(
			"GET",
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`,
		);
		if (typeof data.id !== "number") {
			throw new Error(
				`GitHub returned no installation id for ${owner}/${repo}`,
			);
		}
		installationIds.set(key, data.id);
		return data.id;
	},

	repoRef(owner: string, name: string): RepoRef {
		const { instance } = syncHosts();
		return { forge: "github", instance, owner, name };
	},

	threadRef(repo: RepoRef, kind: ThreadKind, number: number): ThreadRef {
		return {
			forge: repo.forge,
			instance: repo.instance,
			repo,
			kind,
			number: String(number),
		};
	},

	async webOrigin(): Promise<string> {
		const { github: hosts } = await getConfig();
		return new URL(hosts.url).origin;
	},

	async webUrl(path: string): Promise<string> {
		const origin = await forge.webOrigin();
		return `${origin}/${path.replace(/^\//, "")}`;
	},

	resetCaches(): void {
		appProviderPromise = undefined;
		installationProviders.clear();
		installationIds.clear();
	},
};
