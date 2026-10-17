import { beforeEach, describe, expect, test } from "bun:test";
import {
  passthrough,
  rewriteLink,
  toResponse,
  clearPassthroughCache,
  setPassthroughTtl,
} from "./api-passthrough.server";
import { setConfig } from "#/lib/server/config.js";
import { TEST_CONFIG } from "#tests/test-config.js";

type Headers = Record<string, string | undefined>;
type ReqFn = (
  route: string,
  opts?: { headers?: Record<string, string> },
) => Promise<{ data: unknown; headers: Headers }>;

function client(fn: ReqFn) {
  return { request: fn } as never;
}

const SEEN: { route: string; headers: Record<string, string> }[] = [];

function ok(data: unknown, headers: Headers = { etag: '"v1"' }): ReqFn {
  return async (route, opts) => {
    SEEN.push({ route, headers: opts?.headers ?? {} });
    return { data, headers };
  };
}

function fail(err: unknown): ReqFn {
  return async (route, opts) => {
    SEEN.push({ route, headers: opts?.headers ?? {} });
    throw err;
  };
}

const Q = (s = "") => new URLSearchParams(s);

beforeEach(() => {
  SEEN.length = 0;
  clearPassthroughCache();
  setPassthroughTtl(30_000);
  setConfig(TEST_CONFIG);
});

describe("rewriteLink", () => {
  test("rewrites api.github.com origins to /api", () => {
    expect(
      rewriteLink(
        '<https://api.github.com/repos/o/r/issues?page=2>; rel="next", <https://api.github.com/repos/o/r/issues?page=5>; rel="last"',
        "https://api.github.com",
      ),
    ).toBe(
      '</api/repos/o/r/issues?page=2>; rel="next", </api/repos/o/r/issues?page=5>; rel="last"',
    );
  });

  test("rewrites enterprise api/v3 origins to /api", () => {
    expect(
      rewriteLink(
        '<https://acme.ghe.com/api/v3/repos/o/r/issues?page=2>; rel="next"',
        "https://acme.ghe.com/api/v3",
      ),
    ).toBe('</api/repos/o/r/issues?page=2>; rel="next"');
  });

  test("null stays null", () => {
    expect(rewriteLink(null, "https://api.github.com")).toBeNull();
  });
});

describe("passthrough upstream 200", () => {
  test("returns body verbatim with ETag, link and rate headers", async () => {
    const res = await passthrough(
      client(
        ok([{ number: 1 }], {
          etag: '"abc"',
          "last-modified": "Wed, 01 Jan 2025 00:00:00 GMT",
          link: '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"',
          "x-ratelimit-limit": "5000",
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": "123",
        }),
      ),
      7,
      "/repos/o/r/issues",
      Q("state=open"),
      null,
      {},
    );
    expect(res.status).toBe(200);
    expect(res.body).toBe('[{"number":1}]');
    expect(res.headers["ETag"]).toBe('"abc"');
    expect(res.headers["Last-Modified"]).toBe("Wed, 01 Jan 2025 00:00:00 GMT");
    expect(res.headers["Link"]).toBe(
      '</api/repos/o/r/issues?page=2>; rel="next"',
    );
    expect(res.headers["Cache-Control"]).toContain("private");
    expect(res.headers["X-RateLimit-Limit"]).toBe("5000");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("4999");
    expect(res.headers["X-RateLimit-Reset"]).toBe("123");
    expect(SEEN).toHaveLength(1);
    expect(SEEN[0].route).toBe("GET /repos/o/r/issues?state=open");
  });

  test("filters pull_request entries only when asked", async () => {
    const data = [{ number: 1 }, { number: 2, pull_request: {} }];
    const filtered = await passthrough(
      client(ok(data)),
      7,
      "/repos/o/r/issues",
      Q(),
      null,
      { filterPullRequests: true },
    );
    expect(filtered.body).toBe('[{"number":1}]');

    clearPassthroughCache();
    const kept = await passthrough(
      client(ok(data)),
      7,
      "/repos/o/r/issues",
      Q(),
      null,
      {},
    );
    expect(kept.body).toBe('[{"number":1},{"number":2,"pull_request":{}}]');
  });

  test("omits ETag header when upstream has none", async () => {
    const res = await passthrough(
      client(ok({ login: "x" }, {})),
      0,
      "/users/x",
      Q(),
      '"zzz"',
      {},
    );
    expect(res.status).toBe(200);
    expect(res.headers["ETag"]).toBeUndefined();
  });
});

describe("passthrough caching", () => {
  test("fresh cache serves without upstream call, order-insensitive", async () => {
    const c = client(ok([{ number: 1 }]));
    await passthrough(c, 7, "/repos/o/r/issues", Q("a=1&b=2"), null, {});
    expect(SEEN).toHaveLength(1);
    const res = await passthrough(
      c,
      7,
      "/repos/o/r/issues",
      Q("b=2&a=1"),
      null,
      {},
    );
    expect(res.status).toBe(200);
    expect(res.body).toBe('[{"number":1}]');
    expect(SEEN).toHaveLength(1);
  });

  test("fresh cache + matching client ETag returns 304", async () => {
    const c = client(ok([{ number: 1 }], { etag: '"abc"' }));
    await passthrough(c, 7, "/repos/o/r/issues", Q(), null, {});
    const res = await passthrough(c, 7, "/repos/o/r/issues", Q(), '"abc"', {});
    expect(res.status).toBe(304);
    expect(res.body).toBe("");
    expect(res.headers["ETag"]).toBe('"abc"');
    expect(SEEN).toHaveLength(1);
  });

  test("stale cache revalidates with If-None-Match; upstream 304 serves cached body", async () => {
    let calls = 0;
    const c = client(async (_route, opts) => {
      calls++;
      if (calls === 1)
        return { data: [{ number: 1 }], headers: { etag: '"v1"' } };
      expect(opts?.headers?.["If-None-Match"]).toBe('"v1"');
      throw { status: 304 };
    });
    await passthrough(c, 7, "/repos/o/r/issues", Q(), null, {});
    setPassthroughTtl(0);
    const res = await passthrough(c, 7, "/repos/o/r/issues", Q(), null, {});
    expect(res.status).toBe(200);
    expect(res.body).toBe('[{"number":1}]');
  });

  test("stale cache + upstream 304 + matching client ETag returns 304", async () => {
    let calls = 0;
    const c = client(async () => {
      calls++;
      if (calls === 1)
        return { data: [{ number: 1 }], headers: { etag: '"v1"' } };
      throw { status: 304 };
    });
    await passthrough(c, 7, "/repos/o/r/issues", Q(), null, {});
    setPassthroughTtl(0);
    const res = await passthrough(c, 7, "/repos/o/r/issues", Q(), '"v1"', {});
    expect(res.status).toBe(304);
    expect(res.body).toBe("");
  });

  test("stale cache + upstream 200 replaces the body", async () => {
    let calls = 0;
    const c = client(async () => {
      calls++;
      return {
        data: [{ number: calls }],
        headers: { etag: `"v${calls}"` },
      };
    });
    const first = await passthrough(c, 7, "/repos/o/r/issues", Q(), null, {});
    expect(first.body).toBe('[{"number":1}]');
    setPassthroughTtl(0);
    const second = await passthrough(c, 7, "/repos/o/r/issues", Q(), null, {});
    expect(second.body).toBe('[{"number":2}]');
    expect(second.headers["ETag"]).toBe('"v2"');
  });

  test("fresh 200 + matching client ETag returns 304 without extra call", async () => {
    const res = await passthrough(
      client(ok([{ number: 1 }], { etag: '"abc"' })),
      7,
      "/repos/o/r/issues",
      Q(),
      '"abc"',
      {},
    );
    expect(res.status).toBe(304);
    expect(res.body).toBe("");
  });
});

describe("passthrough errors", () => {
  test("404 with fallback is enriched with html_url", async () => {
    const res = await passthrough(
      client(fail({ status: 404 })),
      7,
      "/repos/o/r/issues/9",
      Q(),
      null,
      { htmlUrlFallback: "https://github.com/o/r/issues/9" },
    );
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({
      message: "Not synced, open on GitHub",
      html_url: "https://github.com/o/r/issues/9",
    });
  });

  test("404 without fallback stays plain", async () => {
    const res = await passthrough(
      client(fail({ status: 404 })),
      7,
      "/x",
      Q(),
      null,
      {},
    );
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ message: "Not Found" });
  });

  test("rate-limit errors forward GitHub message and headers", async () => {
    const res = await passthrough(
      client(
        fail({
          status: 429,
          response: {
            data: { message: "API rate limit exceeded" },
            headers: { "retry-after": "60", "x-ratelimit-reset": "123" },
          },
        }),
      ),
      7,
      "/repos/o/r/issues",
      Q(),
      null,
      {},
    );
    expect(res.status).toBe(429);
    expect(JSON.parse(res.body)).toEqual({
      message: "API rate limit exceeded",
    });
    expect(res.headers["Retry-After"]).toBe("60");
    expect(res.headers["X-RateLimit-Reset"]).toBe("123");
  });

  test("status without response payload yields generic message", async () => {
    const res = await passthrough(
      client(fail({ status: 500 })),
      7,
      "/x",
      Q(),
      null,
      {},
    );
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ message: "Upstream error" });
  });

  test("non-HTTP failure yields 502", async () => {
    const res = await passthrough(
      client(fail(new Error("boom"))),
      7,
      "/x",
      Q(),
      null,
      {},
    );
    expect(res.status).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ message: "Bad gateway" });
  });
});

describe("toResponse", () => {
  test("200 sets JSON content type", () => {
    const res = toResponse({
      status: 200,
      body: "[]",
      headers: { ETag: '"a"' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("etag")).toBe('"a"');
  });

  test("304 has null body and keeps ETag", () => {
    const res = toResponse({ status: 304, body: "", headers: { ETag: '"a"' } });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"a"');
  });

  test("error statuses pass through", () => {
    const res = toResponse({
      status: 404,
      body: '{"message":"x"}',
      headers: {},
    });
    expect(res.status).toBe(404);
  });
});
