import { forge } from "#/lib/server/forge/providers.server";
import {
  passthrough,
  toResponse,
} from "#/lib/server/github/api-passthrough.server";

/**
 * Map a failed installation lookup to a client response.
 * Unknown repo / App not installed -> enriched 404, else forward status.
 * The 404 link resolves against the configured web host, so enterprise
 * instances point at `https://acme.ghe.com/<owner>/<repo>` rather than
 * github.com.
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
        html_url: await forge.webUrl(`${owner}/${repo}`),
      },
      { status: 404 },
    );
  }
  return Response.json({ message: "Upstream error" }, { status });
}

interface RepoGetOptions {
  /** Query params forwarded upstream; every other param is dropped. */
  query?: ReadonlySet<string>;
  /** Drop entries with a `pull_request` key (issues lists). */
  filterPullRequests?: boolean;
  /** Repo-relative path used to enrich upstream 404s with `html_url`. */
  fallbackPath?: string;
}

/**
 * Resolve the installation and serve the shared GitHub REST passthrough:
 * allowlisted query, `If-None-Match`, `pull_request` filtering, and 404
 * `html_url` enrichment, so every `GET /api/repos/...` route stays one shape.
 */
export async function repoGet(
  params: { owner: string; repo: string; number?: string; name?: string },
  request: Request,
  path: string,
  options: RepoGetOptions = {},
): Promise<Response> {
  let installationId: number;
  try {
    installationId = await forge.getInstallationId(params.owner, params.repo);
  } catch (e) {
    return installationErrorResponse(params.owner, params.repo, e);
  }

  const query = new URLSearchParams();
  for (const [k, v] of new URL(request.url).searchParams) {
    if (options.query?.has(k)) query.append(k, v);
  }

  const result = await passthrough(
    await forge.installationProvider(installationId),
    installationId,
    path,
    query,
    request.headers.get("if-none-match"),
    {
      filterPullRequests: options.filterPullRequests,
      htmlUrlFallback: options.fallbackPath
        ? await forge.webUrl(options.fallbackPath)
        : undefined,
    },
  );
  return toResponse(result);
}
