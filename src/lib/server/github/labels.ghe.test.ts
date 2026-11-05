/**
 * Label provisioning against a GitHub Enterprise Server-shaped host.
 *
 * The fast fake-provider suite in `labels.test.ts` covers reconciliation logic
 * without the network. This file drives the same code through a real `forges`
 * installation provider under `GHE_CONFIG`, so every list/create/patch lands on
 * `https://acme.ghe.com/api/v3/...`.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import { forge } from "#/lib/server/forge/providers.server";
import { seedTestGithubApp } from "#tests/github-app";
import { GHE_CONFIG } from "#tests/test-config";
import { CANONICAL_LABELS, provisionRepoLabels } from "./labels";

interface FakeLabel {
  name: string;
  color: string;
  description?: string | null;
}

interface SeenCall {
  method: string;
  url: string;
  auth: string | null;
  body?: unknown;
}

const realFetch = globalThis.fetch;
const API_BASE = "https://acme.ghe.com/api/v3";
const LABELS_PATH = `${API_BASE}/repos/acme/widgets/labels`;
const LABELS_PATHNAME = new URL(LABELS_PATH).pathname;

let calls: SeenCall[] = [];
let existing: FakeLabel[] = [];

function label(name: string) {
  const found = CANONICAL_LABELS.find((entry) => entry.name === name);
  if (!found) throw new Error(`unknown canonical label: ${name}`);
  return found;
}

beforeEach(async () => {
  setConfig(GHE_CONFIG);
  forge.resetCaches();
  calls = [];
  existing = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    const { pathname } = new URL(url);
    const method = (init?.method ?? "GET").toUpperCase();
    const rawBody = init?.body;
    calls.push({
      method,
      url,
      auth: new Headers(init?.headers).get("authorization"),
      body: typeof rawBody === "string" ? JSON.parse(rawBody) : undefined,
    });

    if (pathname.endsWith("/app/installations/4242/access_tokens")) {
      return Response.json({
        token: "ghs_ghe",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    if (pathname.endsWith("/repos/acme/widgets/installation")) {
      return Response.json({ id: 4242 });
    }
    if (pathname === LABELS_PATHNAME && method === "GET") {
      return Response.json(existing);
    }
    if (pathname === LABELS_PATHNAME && method === "POST") {
      return Response.json({
        name: (rawBody && JSON.parse(rawBody).name) ?? "",
        color: (rawBody && JSON.parse(rawBody).color) ?? "",
      });
    }
    if (pathname.startsWith(`${LABELS_PATHNAME}/`)) {
      return Response.json({});
    }
    return Response.json({});
  }) as typeof fetch;
  await seedTestGithubApp(4242);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  forge.resetCaches();
});

describe("provisionRepoLabels on GHES", () => {
  test("lists, creates and patches under /api/v3 on the GHE host", async () => {
    const backlog = label("backlog");
    const todo = label("todo");
    const inProgress = label("in-progress");

    // "Backlog" has drifted, "in-progress" is converged, "todo" is missing.
    existing = [
      { name: "Backlog", color: "000000", description: "old" },
      {
        name: inProgress.name,
        color: inProgress.color,
        description: inProgress.description,
      },
    ];

    const summary = await provisionRepoLabels("acme", "widgets", [
      backlog,
      todo,
      inProgress,
    ]);

    expect(summary).toEqual({
      created: ["todo"],
      updated: ["backlog"],
      unchanged: ["in-progress"],
    });

    const labelCalls = calls.filter((call) => call.url.startsWith(LABELS_PATH));
    expect(labelCalls.map((call) => call.method).sort()).toEqual([
      "GET",
      "PATCH",
      "POST",
    ]);
    for (const call of labelCalls) {
      expect(call.url.startsWith(`${API_BASE}/repos/acme/widgets/labels`)).toBe(
        true,
      );
      expect(new URL(call.url).host).toBe("acme.ghe.com");
      expect(call.auth).toBe("Bearer ghs_ghe");
    }

    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "PATCH",
        url: `${LABELS_PATH}/Backlog`,
        body: {
          color: backlog.color,
          description: backlog.description,
        },
      }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "POST",
        url: LABELS_PATH,
        body: {
          name: todo.name,
          color: todo.color,
          description: todo.description,
        },
      }),
    );
    expect(
      calls.some((call) => call.url.startsWith("https://api.github.com")),
    ).toBe(false);
  });
});
