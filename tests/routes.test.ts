import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import { resetAppCache } from "#/lib/server/github/app.server";
import { clearPassthroughCache } from "#/lib/server/github/api-passthrough.server";
import { GET as getIssues } from "#/routes/api/repos/[owner]/[repo]/issues/+server";
import { GET as getIssue } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/+server";
import { GET as getComments } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/comments/+server";
import { GET as getLabels } from "#/routes/api/repos/[owner]/[repo]/labels/+server";
import { GET as getLabel } from "#/routes/api/repos/[owner]/[repo]/labels/[name]/+server";
import { GET as getUser } from "#/routes/api/users/[username]/+server";
import { GET as authRoute } from "#/routes/api/auth/[...all]/+server";
import { TEST_CONFIG } from "#tests/test-config";

// Every read route now requires a signed-in `read` session (RBAC).
const READ = { user: { id: "reader", role: "read" }, session: null };

// Module test: real route wiring (installation lookup, query allowlists,
// passthrough cache) with the network stubbed at `fetch`.
const realFetch = globalThis.fetch;
const SEEN: string[] = [];
const FETCHED: string[] = [];
let canned: { status: number; data: unknown; headers: Record<string, string> } = {
  status: 200,
  data: [],
  headers: {},
};
let failInstall = false;

async function stubFetch(input: unknown): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  FETCHED.push(url);
  if (url.includes("/app/installations/")) {
    return Response.json({
      token: "test-token",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
  }
  if (url.endsWith("/installation")) {
    if (failInstall) {
      return Response.json({ message: "Not Found" }, { status: 404 });
    }
    return Response.json({ id: 7 });
  }
  const u = new URL(url);
  SEEN.push(`GET ${u.pathname}${u.search}`);
  return Response.json(canned.data, {
    status: canned.status,
    headers: canned.headers,
  });
}

function req(query = "", etag: string | null = null) {
  return new Request(`http://x/api${query}`, {
    headers: etag ? { "If-None-Match": etag } : {},
  });
}

beforeEach(() => {
  SEEN.length = 0;
  FETCHED.length = 0;
  clearPassthroughCache();
  setConfig(TEST_CONFIG);
  resetAppCache();
  canned = { status: 200, data: [], headers: {} };
  failInstall = false;
  globalThis.fetch = stubFetch as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("GET issues list", () => {
  test("forwards allowlisted params, drops unknown ones", async () => {
    const res = await getIssues({
      params: { owner: "o", repo: "r" },
      url: new URL(
        "http://x/?state=open&labels=p1&assignee=bob&creator=a&mentioned=m&milestone=1&since=2024-01-01T00:00:00Z&sort=updated&direction=desc&per_page=5&page=2&evil=1",
      ),
      request: req(),
      locals: READ,
    } as never);
    expect(res.status).toBe(200);
    expect(SEEN).toHaveLength(1);
    const upstream = SEEN[0];
    for (const p of [
      "state=open",
      "labels=p1",
      "assignee=bob",
      "per_page=5",
      "page=2",
    ]) {
      expect(upstream).toContain(p);
    }
    expect(upstream).not.toContain("evil");
  });

  test("drops pull_request entries and rewrites Link", async () => {
    canned = {
      status: 200,
      data: [{ number: 1 }, { number: 2, pull_request: {} }],
      headers: {
        etag: '"a"',
        link: '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"',
      },
    };
    const res = await getIssues({
      params: { owner: "o", repo: "r" },
      url: new URL("http://x/"),
      request: req(),
      locals: READ,
    } as never);
    expect(await res.json()).toEqual([{ number: 1 }]);
    expect(res.headers.get("link")).toBe(
      '</api/repos/o/r/issues?page=2>; rel="next"',
    );
  });

  test("honors client If-None-Match", async () => {
    canned = { status: 200, data: [], headers: { etag: '"a"' } };
    const event = {
      params: { owner: "o", repo: "r" },
      url: new URL("http://x/"),
      locals: READ,
    } as never;
    await getIssues({ ...event, request: req() } as never);
    const cached = await getIssues({ ...event, request: req("", '"a"') } as never);
    expect(cached.status).toBe(304);
  });

  test("installation failure maps to enriched 404", async () => {
    failInstall = true;
    const res = await getIssues({
      params: { owner: "nope", repo: "missing" },
      url: new URL("http://x/"),
      request: req(),
      locals: READ,
    } as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      message: "Not synced, open on GitHub",
      html_url: "https://github.com/nope/missing",
    });
  });

  test("other repo routes map installation failure to 404", async () => {
    failInstall = true;
    // Fresh repos each: the installation-id cache must miss for the
    // failure path to trigger.
    for (const [call, params] of [
      [getIssue, { owner: "ghost", repo: "void-1", number: "1" }],
      [getComments, { owner: "ghost", repo: "void-2", number: "1" }],
      [getLabels, { owner: "ghost", repo: "void-3" }],
      [getLabel, { owner: "ghost", repo: "void-4", name: "p1" }],
    ] as const) {
      const res = await call({
        params,
        url: new URL("http://x/"),
        request: req(),
        locals: READ,
      } as never);
      expect(res.status).toBe(404);
    }
  });
});

describe("GET single issue", () => {
  test("hits the numbered upstream path", async () => {
    canned = { status: 200, data: { number: 42 }, headers: {} };
    const res = await getIssue({
      params: { owner: "o", repo: "r", number: "42" },
      url: new URL("http://x/"),
      request: req(),
      locals: READ,
    } as never);
    expect(SEEN[0]).toBe("GET /repos/o/r/issues/42");
    expect(await res.json()).toEqual({ number: 42 });
  });

  test("upstream 404 carries the issue html_url", async () => {
    canned = { status: 404, data: { message: "Not Found" }, headers: {} };
    const res = await getIssue({
      params: { owner: "o", repo: "r", number: "42" },
      url: new URL("http://x/"),
      request: req(),
      locals: READ,
    } as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      message: "Not synced, open on GitHub",
      html_url: "https://github.com/o/r/issues/42",
    });
  });
});

describe("GET comments", () => {
  test("keeps since/per_page/page, drops the rest", async () => {
    await getComments({
      params: { owner: "o", repo: "r", number: "7" },
      url: new URL(
        "http://x/?since=2024-01-01T00:00:00Z&per_page=10&page=3&state=open",
      ),
      request: req(),
      locals: READ,
    } as never);
    expect(SEEN[0]).toContain("/repos/o/r/issues/7/comments");
    expect(SEEN[0]).toContain("since=");
    expect(SEEN[0]).toContain("per_page=10");
    expect(SEEN[0]).toContain("page=3");
    expect(SEEN[0]).not.toContain("state=");
  });
});

describe("GET labels", () => {
  test("lists with pagination params", async () => {
    canned = { status: 200, data: [{ name: "p1" }], headers: {} };
    const res = await getLabels({
      params: { owner: "o", repo: "r" },
      url: new URL("http://x/?per_page=100&page=1&state=open"),
      request: req(),
      locals: READ,
    } as never);
    expect(SEEN[0]).toContain("/repos/o/r/labels");
    expect(SEEN[0]).not.toContain("state=");
    expect(await res.json()).toEqual([{ name: "p1" }]);
  });

  test("single label encodes the name", async () => {
    canned = { status: 200, data: { name: "bug fix" }, headers: {} };
    const res = await getLabel({
      params: { owner: "o", repo: "r", name: "bug fix" },
      url: new URL("http://x/"),
      request: req(),
      locals: READ,
    } as never);
    expect(SEEN[0]).toBe("GET /repos/o/r/labels/bug%20fix");
    expect(await res.json()).toEqual({ name: "bug fix" });
  });
});

describe("GET user", () => {
  test("uses the app client without an installation lookup", async () => {
    canned = {
      status: 200,
      data: { login: "octocat", avatar_url: "https://example.com/a.png" },
      headers: {},
    };
    const res = await getUser({
      params: { username: "octocat" },
      url: new URL("http://x/"),
      request: req(),
      locals: READ,
    } as never);
    expect(SEEN).toEqual(["GET /users/octocat"]);
    expect(FETCHED.some((u) => u.includes("/installation"))).toBe(false);
    expect(await res.json()).toEqual({
      login: "octocat",
      avatar_url: "https://example.com/a.png",
    });
  });

  test("unknown user carries the profile html_url", async () => {
    canned = { status: 404, data: { message: "Not Found" }, headers: {} };
    const res = await getUser({
      params: { username: "ghost" },
      url: new URL("http://x/"),
      request: req(),
      locals: READ,
    } as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      message: "Not synced, open on GitHub",
      html_url: "https://github.com/ghost",
    });
  });
});

describe("Better Auth mount", () => {
  test("catch-all route forwards /api/auth/* to the handler", async () => {
    const res = await authRoute({
      request: new Request("http://x/api/auth/get-session"),
    } as never);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });
});
