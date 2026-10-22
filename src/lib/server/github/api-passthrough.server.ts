/**
 * Shared GitHub REST passthrough with internal ETag cache.
 *
 * All GET `/api/repos/...` routes call `passthrough()` so caching,
 * conditional fetching (`If-None-Match` both directions), `Link`
 * header rewriting to `/api/...`, `pull_request` filtering, and
 * 404 `html_url` enrichment live in one place.
 *
 * Bodies pass through verbatim (no SQL, no field mapping). Transport
 * is always REST via the installation provider — GraphQL only pays off
 * for batched sync hydration, not per-request serving.
 */
import { ForgeApiError, RateLimitedError } from "forges";
import type { GitHubProvider } from "forges/github";
import { getConfig } from "#/lib/server/config";
import {
  etagMatches,
  getCache,
  isFresh,
  setCache,
  cacheKey,
  type CacheEntry,
} from "./cache";

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

/**
 * Rewrite upstream pagination links onto the Funnel mirror:
 * `<https://api.github.com/...>` (or `<https://acme.ghe.com/api/v3/...>`)
 * -> `</api/...>` so clients stay inside Funnel.
 */
export function rewriteLink(
  link: string | null,
  apiUrl: string,
): string | null {
  if (!link) return null;
  return link.replaceAll(apiUrl.replace(/\/$/, "") + "/", "/api/");
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

function cachedResult(
  cached: CacheEntry,
  clientEtag: string | null,
): PassthroughResult {
  if (etagMatches(clientEtag, cached.etag)) {
    return { status: 304, body: "", headers: clientHeaders(cached) };
  }
  const headers = withRateHeaders(clientHeaders(cached), cached);
  if (cached.link) headers["Link"] = cached.link;
  return { status: 200, body: cached.body, headers };
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
  if (e instanceof ForgeApiError) return e.status;
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
  let body: string | null = null;
  if (e instanceof ForgeApiError) {
    body = e.body;
  } else if (typeof e === "object" && e !== null && "body" in e) {
    const raw = (e as { body?: unknown }).body;
    if (typeof raw === "string") body = raw;
  }

  let data: unknown = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      data = body;
    }
  }

  let headers: Record<string, string | undefined> = {};
  if (typeof e === "object" && e !== null && "headers" in e) {
    const h = (e as { headers?: unknown }).headers;
    if (h instanceof Headers) {
      headers = Object.fromEntries(h.entries());
    } else if (typeof h === "object" && h !== null) {
      headers = h as Record<string, string | undefined>;
    }
  }
  return { data, headers };
}

export async function passthrough(
  provider: Pick<GitHubProvider, "request">,
  installationId: number,
  upstreamPath: string,
  clientQuery: URLSearchParams,
  clientEtag: string | null,
  options: PassthroughOptions = {},
): Promise<PassthroughResult> {
  const { github: hosts } = await getConfig();
  const key = cacheKey(installationId, upstreamPath, clientQuery);
  const cached = getCache(key);
  const now = Date.now();
  const fresh = cached !== undefined && isFresh(cached, now);

  // Fresh cache: no GitHub call at all (saves secondary-limit points).
  if (cached && fresh) {
    setCache(key, cached);
    return cachedResult(cached, clientEtag);
  }

  try {
    const res = await provider.request("GET", upstreamPath, {
      query: Object.fromEntries(clientQuery),
      headers: {
        accept: "application/vnd.github+json",
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
      },
    });

    // Conditional revalidation: upstream says our cache is still current.
    if (res.status === 304 && cached) {
      cached.fetchedAt = now;
      setCache(key, cached);
      return cachedResult(cached, clientEtag);
    }
    if (res.status === 304) {
      return { status: 304, body: "", headers: {} };
    }

    const upstream = Object.fromEntries(res.headers.entries());
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
    const etag = header(upstream, "etag");
    const lastModified = header(upstream, "last-modified");
    const entry: CacheEntry = {
      etag,
      lastModified,
      link: rewriteLink(header(upstream, "link"), hosts.api_url),
      body,
      fetchedAt: now,
      rateLimit: header(upstream, "x-ratelimit-limit"),
      rateRemaining: header(upstream, "x-ratelimit-remaining"),
      rateReset: header(upstream, "x-ratelimit-reset"),
      retryAfter: header(upstream, "retry-after"),
    };
    setCache(key, entry);

    return cachedResult(entry, clientEtag);
  } catch (e) {
    const status = errorStatus(e);

    // Conditional revalidation: upstream says our cache is still current.
    if (status === 304 && cached) {
      cached.fetchedAt = now;
      setCache(key, cached);
      return cachedResult(cached, clientEtag);
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
      // `forges` errors carry no response headers, so aside from the fields we
      // can reconstruct, upstream headers are unavailable here. Errors that
      // include them (e.g. a plain Octokit error) still pass them through.
      const resetAt = e instanceof RateLimitedError ? e.resetAt : undefined;
      const resetSeconds =
        resetAt instanceof Date && !Number.isNaN(resetAt.getTime())
          ? String(Math.floor(resetAt.getTime() / 1000))
          : null;
      const effectiveReset = rateReset ?? resetSeconds;
      if (effectiveReset) headers["X-RateLimit-Reset"] = effectiveReset;
      return { status, body, headers };
    }

    return {
      status: 502,
      body: JSON.stringify({ message: "Bad gateway" }),
      headers: { "Content-Type": "application/json" },
    };
  }
}
