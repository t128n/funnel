/**
 * Bounded in-memory cache for GitHub passthrough responses.
 *
 * Size-bounding comes from `lru-cache` (LRU eviction at 500 entries).
 * Freshness is tracked explicitly via `fetchedAt` + TTL so stale
 * entries stay available for conditional revalidation
 * (`If-None-Match` -> upstream `304`), which `lru-cache` TTL
 * auto-purge would otherwise discard.
 */
import { LRUCache } from "lru-cache";

export interface CacheEntry {
  etag: string | null;
  lastModified: string | null;
  link: string | null;
  body: string;
  fetchedAt: number;
  rateLimit: string | null;
  rateRemaining: string | null;
  rateReset: string | null;
  retryAfter: string | null;
}

const MAX_ENTRIES = 500;
let ttlMs = 30_000;

/** Override cache TTL (sync cadence: 30s active / 300s idle). */
export function setPassthroughTtl(ms: number): void {
  ttlMs = ms;
}

/** Clear cache (tests). */
export function clearPassthroughCache(): void {
  cache.clear();
}

const cache = new LRUCache<string, CacheEntry>({ max: MAX_ENTRIES });

export function cacheKey(
  installationId: number,
  upstreamPath: string,
  query: URLSearchParams,
): string {
  const sorted = new URLSearchParams(
    [...query.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const qs = sorted.toString();
  return `${installationId}:${upstreamPath}${qs ? `?${qs}` : ""}`;
}

export function getCache(key: string): CacheEntry | undefined {
  return cache.get(key);
}

export function setCache(key: string, entry: CacheEntry): void {
  cache.set(key, entry);
}

export function isFresh(entry: CacheEntry, now = Date.now()): boolean {
  return now - entry.fetchedAt < ttlMs;
}

function normalizeEtag(tag: string): string {
  return tag.trim().replace(/^W\//, "");
}

/** Weak comparison; handles `*` and comma-separated lists. */
export function etagMatches(
  clientEtag: string | null,
  current: string | null,
): boolean {
  if (!clientEtag || !current) return false;
  if (clientEtag.trim() === "*") return true;
  const want = normalizeEtag(current);
  return clientEtag
    .split(",")
    .map((t) => normalizeEtag(t))
    .includes(want);
}
