/**
 * Shared GitHub REST passthrough with internal ETag cache.
 *
 * All GET `/api/repos/...` routes call `passthrough()` so caching,
 * conditional fetching (`If-None-Match` both directions), `Link`
 * header rewriting to `/api/...`, `pull_request` filtering, and
 * 404 `html_url` enrichment live in one place.
 *
 * Bodies pass through verbatim (no SQL, no field mapping). Transport
 * is always REST via the installation Octokit — GraphQL only pays off
 * for batched sync hydration, not per-request serving.
 */
import type { InstallationOctokit } from "./app.server";
import {
  etagMatches,
  getCache,
  isFresh,
  setCache,
  cacheKey,
  type CacheEntry,
} from "./cache.js";

// Re-exported so existing callers keep importing from here.
export { clearPassthroughCache, setPassthroughTtl } from "./cache";

export interface PassthroughOptions {
  /** Drop entries with a `pull_request` key (issues lists). */
  filterPullRequests?: boolean;
  /** Enrich upstream 404s with this `html_url` ("Not synced" UX). */
  htmlUrlFallback?: string;
}

export interface PassthroughResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

function header(
  headers: Record<string, string | undefined>,
  name: string,
): string | null {
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

/** `<https://api.github.com/...>` -> `</api/...>` so clients stay inside Funnel. */
export function rewriteLink(link: string | null): string | null {
  if (!link) return null;
  return link.replaceAll("https://api.github.com/", "/api/");
}

function clientHeaders(
  entry: Pick<CacheEntry, "etag" | "lastModified">,
): Record<string, string> {
  const out: Record<string, string> = {
    "Cache-Control": "private, max-age=15, must-revalidate",
    "X-Funnel-Fetched-At": new Date().toISOString(),
  };
  if (entry.etag) out["ETag"] = entry.etag;
  if (entry.lastModified) out["Last-Modified"] = entry.lastModified;
  return out;
}

function withRateHeaders(
  out: Record<string, string>,
  entry: Pick<
    CacheEntry,
    "rateLimit" | "rateRemaining" | "rateReset" | "retryAfter"
  >,
): Record<string, string> {
  if (entry.rateLimit) out["X-RateLimit-Limit"] = entry.rateLimit;
  if (entry.rateRemaining) out["X-RateLimit-Remaining"] = entry.rateRemaining;
  if (entry.rateReset) out["X-RateLimit-Reset"] = entry.rateReset;
  if (entry.retryAfter) out["Retry-After"] = entry.retryAfter;
  return out;
}

interface UpstreamSuccess {
  data: unknown;
  headers: Record<string, string | undefined>;
}

/** Convert a passthrough result to a SvelteKit `Response` (304s carry no body). */
export function toResponse(result: PassthroughResult): Response {
  if (result.status === 304) {
    const headers = { ...result.headers };
    delete headers["Content-Type"];
    return new Response(null, { status: 304, headers });
  }
  return new Response(result.body, {
    status: result.status,
    headers: { "Content-Type": "application/json", ...result.headers },
  });
}

function errorStatus(e: unknown): number | null {
  if (typeof e === "object" && e !== null && "status" in e) {
    const s = (e as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return null;
}

function errorPayload(e: unknown): {
  data: unknown;
  headers: Record<string, string | undefined>;
} {
  if (typeof e === "object" && e !== null && "response" in e) {
    const r = (
      e as {
        response?: {
          data?: unknown;
          headers?: Record<string, string | undefined>;
        };
      }
    ).response;
    if (r) return { data: r.data, headers: r.headers ?? {} };
  }
  return { data: null, headers: {} };
}

export async function passthrough(
  octokit: Pick<InstallationOctokit, "request">,
  installationId: number,
  upstreamPath: string,
  clientQuery: URLSearchParams,
  clientEtag: string | null,
  options: PassthroughOptions = {},
): Promise<PassthroughResult> {
  const key = cacheKey(installationId, upstreamPath, clientQuery);
  const cached = getCache(key);
  const now = Date.now();
  const fresh = cached !== undefined && isFresh(cached, now);

  // Fresh cache: no GitHub call at all (saves secondary-limit points).
  if (cached && fresh) {
    setCache(key, cached);
    if (etagMatches(clientEtag, cached.etag)) {
      return { status: 304, body: "", headers: clientHeaders(cached) };
    }
    const headers = withRateHeaders(clientHeaders(cached), cached);
    if (cached.link) headers["Link"] = cached.link;
    return { status: 200, body: cached.body, headers };
  }

  const qs = clientQuery.toString();
  const route = `GET ${upstreamPath}${qs ? `?${qs}` : ""}` as `GET ${string}`;

  try {
    const res = (await octokit.request(route, {
      headers: {
        accept: "application/vnd.github+json",
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
      },
    })) as unknown as UpstreamSuccess;

    let { data } = res;
    if (options.filterPullRequests && Array.isArray(data)) {
      data = data.filter(
        (item) =>
          !(
            typeof item === "object" &&
            item !== null &&
            "pull_request" in item
          ),
      );
    }
    const body = JSON.stringify(data);
    const etag = header(res.headers, "etag");
    const lastModified = header(res.headers, "last-modified");
    const entry: CacheEntry = {
      etag,
      lastModified,
      link: rewriteLink(header(res.headers, "link")),
      body,
      fetchedAt: now,
      rateLimit: header(res.headers, "x-ratelimit-limit"),
      rateRemaining: header(res.headers, "x-ratelimit-remaining"),
      rateReset: header(res.headers, "x-ratelimit-reset"),
      retryAfter: header(res.headers, "retry-after"),
    };
    setCache(key, entry);

    if (etagMatches(clientEtag, etag)) {
      return { status: 304, body: "", headers: clientHeaders(entry) };
    }
    const headers = withRateHeaders(clientHeaders(entry), entry);
    if (entry.link) headers["Link"] = entry.link;
    return { status: 200, body, headers };
  } catch (e) {
    const status = errorStatus(e);

    // Conditional revalidation: upstream says our cache is still current.
    if (status === 304 && cached) {
      cached.fetchedAt = now;
      setCache(key, cached);
      if (etagMatches(clientEtag, cached.etag)) {
        return { status: 304, body: "", headers: clientHeaders(cached) };
      }
      const headers = withRateHeaders(clientHeaders(cached), cached);
      if (cached.link) headers["Link"] = cached.link;
      return { status: 200, body: cached.body, headers };
    }

    if (status === 404) {
      const body = options.htmlUrlFallback
        ? JSON.stringify({
            message: "Not synced, open on GitHub",
            html_url: options.htmlUrlFallback,
          })
        : JSON.stringify({ message: "Not Found" });
      return {
        status: 404,
        body,
        headers: { "Content-Type": "application/json" },
      };
    }

    // Rate limits / other upstream errors: forward GitHub's message verbatim.
    if (status !== null) {
      const { data, headers: uh } = errorPayload(e);
      const body =
        typeof data === "string"
          ? data
          : JSON.stringify(data ?? { message: "Upstream error" });
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const retryAfter = header(uh, "retry-after");
      const rateReset = header(uh, "x-ratelimit-reset");
      if (retryAfter) headers["Retry-After"] = retryAfter;
      if (rateReset) headers["X-RateLimit-Reset"] = rateReset;
      return { status, body, headers };
    }

    return {
      status: 502,
      body: JSON.stringify({ message: "Bad gateway" }),
      headers: { "Content-Type": "application/json" },
    };
  }
}
