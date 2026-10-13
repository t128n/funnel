import { beforeEach, describe, expect, test } from "bun:test";
import {
  cacheKey,
  clearPassthroughCache,
  etagMatches,
  getCache,
  isFresh,
  setCache,
  setPassthroughTtl,
  type CacheEntry,
} from "./cache.js";

function entry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    etag: '"abc"',
    lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
    link: null,
    body: "{}",
    fetchedAt: Date.now(),
    rateLimit: null,
    rateRemaining: null,
    rateReset: null,
    retryAfter: null,
    ...overrides,
  };
}

beforeEach(() => {
  clearPassthroughCache();
  setPassthroughTtl(30_000);
});

describe("cacheKey", () => {
  test("is insensitive to query param order", () => {
    expect(cacheKey(1, "/p", new URLSearchParams("b=2&a=1"))).toBe(
      cacheKey(1, "/p", new URLSearchParams("a=1&b=2")),
    );
  });

  test("namespaces by installation id and path", () => {
    const a = cacheKey(1, "/repos/o/r/issues", new URLSearchParams());
    expect(a).not.toBe(cacheKey(2, "/repos/o/r/issues", new URLSearchParams()));
    expect(a).not.toBe(cacheKey(1, "/repos/o/r/labels", new URLSearchParams()));
    expect(a).not.toBe(
      cacheKey(1, "/repos/o/r/issues", new URLSearchParams("state=open")),
    );
  });

  test("omits the query string when empty", () => {
    expect(cacheKey(1, "/p", new URLSearchParams())).toBe("1:/p");
  });
});

describe("etagMatches", () => {
  test("exact match", () => {
    expect(etagMatches('"abc"', '"abc"')).toBe(true);
  });

  test("weak comparison ignores W/ prefix on either side", () => {
    expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"abc"', 'W/"abc"')).toBe(true);
  });

  test("matches within a comma-separated list", () => {
    expect(etagMatches('"zzz", "abc"', '"abc"')).toBe(true);
  });

  test("star matches anything present", () => {
    expect(etagMatches("*", '"abc"')).toBe(true);
  });

  test("returns false for mismatches and missing values", () => {
    expect(etagMatches('"zzz"', '"abc"')).toBe(false);
    expect(etagMatches(null, '"abc"')).toBe(false);
    expect(etagMatches('"abc"', null)).toBe(false);
    expect(etagMatches(null, null)).toBe(false);
  });
});

describe("isFresh", () => {
  test("fresh within TTL, stale after", () => {
    expect(isFresh(entry({ fetchedAt: Date.now() }))).toBe(true);
    expect(isFresh(entry({ fetchedAt: Date.now() - 60_000 }))).toBe(false);
  });

  test("follows setPassthroughTtl", () => {
    setPassthroughTtl(0);
    expect(isFresh(entry({ fetchedAt: Date.now() }))).toBe(false);
    setPassthroughTtl(60_000);
    expect(isFresh(entry({ fetchedAt: Date.now() - 30_000 }))).toBe(true);
  });
});

describe("lru storage", () => {
  test("round-trips entries and clears", () => {
    setCache("k", entry({ body: '{"n":1}' }));
    expect(getCache("k")?.body).toBe('{"n":1}');
    expect(getCache("missing")).toBeUndefined();
    clearPassthroughCache();
    expect(getCache("k")).toBeUndefined();
  });

  test("evicts least-recently-used entries past capacity", () => {
    for (let i = 0; i < 520; i++) {
      setCache(`k${i}`, entry({ body: `${i}` }));
    }
    expect(getCache("k0")).toBeUndefined();
    expect(getCache("k19")).toBeUndefined();
    expect(getCache("k519")?.body).toBe("519");
  });
});
