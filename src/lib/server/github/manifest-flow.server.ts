/**
 * Network side of the GitHub App Manifest Flow (SPEC §4).
 *
 * Kept apart from the pure {@link file://./manifest.ts} builder so the
 * manifest shape stays unit-testable without stubbing the network. Everything
 * here targets the configured `github.api_url`, so GitHub Enterprise Server
 * works unchanged.
 */
import { getConfig } from "#/lib/server/config";
import { github } from "./app.server";
import type { ManifestCredentialsInput } from "./credentials";

/** The subset of the conversion response Funnel stores. */
export interface ManifestConversion {
  id: number;
  slug: string;
  name: string;
  owner: { login: string; type: string };
  html_url: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string | null;
  pem: string;
}

/** Raised when GitHub rejects the manifest conversion code. */
export class ManifestExchangeError extends Error {
  override name = "ManifestExchangeError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Exchange the temporary `code` from the manifest redirect for real App
 * credentials (`POST /app-manifests/{code}/conversions`). Unauthenticated by
 * design — the code itself is the bearer of the exchange.
 */
export async function exchangeManifestCode(
  code: string,
): Promise<ManifestConversion> {
  const { github: hosts } = await getConfig();
  const base = hosts.api_url.replace(/\/$/, "");
  const response = await fetch(
    `${base}/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ManifestExchangeError(
      response.status,
      `GitHub rejected the manifest conversion (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }
  return (await response.json()) as ManifestConversion;
}

/** Map a conversion response into the stored credential shape. */
export function toCredentialsInput(
  conversion: ManifestConversion,
  baseUrl: string,
): ManifestCredentialsInput {
  return {
    appId: conversion.id,
    slug: conversion.slug,
    name: conversion.name,
    ownerLogin: conversion.owner?.login ?? "",
    ownerType: conversion.owner?.type ?? "",
    htmlUrl: conversion.html_url,
    baseUrl,
    clientId: conversion.client_id,
    clientSecret: conversion.client_secret,
    webhookSecret: conversion.webhook_secret ?? null,
    privateKey: conversion.pem,
  };
}

/** `https://github.com/apps/<slug>/installations/new` on the configured host. */
export async function installationUrl(slug: string): Promise<string> {
  const { github: hosts } = await getConfig();
  const base = hosts.url.replace(/\/$/, "");
  return `${base}/apps/${encodeURIComponent(slug)}/installations/new`;
}

export interface AppInstallation {
  id: number;
  accountLogin: string;
  accountType: string;
}

/** List the App's installations (`GET /app/installations`, App JWT). */
export async function listInstallations(): Promise<AppInstallation[]> {
  const client = await github.asApp();
  const { data } = await client.request("GET /app/installations", {
    per_page: 100,
  });
  return (data as Array<{ id: number; account: { login: string; type: string } }>).map(
    (installation) => ({
      id: installation.id,
      accountLogin: installation.account?.login ?? "",
      accountType: installation.account?.type ?? "",
    }),
  );
}

export interface InstallationRepo {
  fullName: string;
  private: boolean;
  archived: boolean;
  htmlUrl: string;
}

/** List the repositories an installation can access (`GET /installation/repositories`). */
export async function listInstallationRepos(
  installationId: number,
): Promise<InstallationRepo[]> {
  const octokit = await github.asInstallation(installationId);
  const all: InstallationRepo[] = [];
  for (let page = 1; ; page++) {
    const { data } = await octokit.request("GET /installation/repositories", {
      per_page: 100,
      page,
    });
    const repositories = (
      data as {
        repositories?: Array<{
          full_name: string;
          private: boolean;
          archived: boolean;
          html_url: string;
        }>;
      }
    ).repositories;
    if (!repositories?.length) break;
    for (const repo of repositories) {
      all.push({
        fullName: repo.full_name,
        private: repo.private,
        archived: repo.archived,
        htmlUrl: repo.html_url,
      });
    }
    if (repositories.length < 100) break;
  }
  return all;
}
