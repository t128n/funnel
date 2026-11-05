import { beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateWebhookDelivery } from "#lib/server/db/schema";
import * as mirror from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import {
  DELIVERY_RETENTION_MS,
  handleWebhook,
  linkedIssuesForPullRequest,
  MAX_REFRESHES_PER_DELIVERY,
  MAX_WEBHOOK_BYTES,
  verifyWebhookSignature,
  webhookDeliveryExists,
  type WebhookDeps,
} from "./webhooks";

const SECRET = "0123456789abcdef0123456789abcdef01234567";
const NOW = 1_800_000_000_000;
const URL = "http://localhost/api/github/webhooks";

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function payload(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    repository: { full_name: "acme/widgets" },
    ...extra,
  });
}

interface RequestOptions {
  event?: string | null;
  delivery?: string | null;
  signature?: string | null;
  body?: string;
}

function webhookRequest(body: string, options: RequestOptions = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  const event = options.event === undefined ? "issues" : options.event;
  const delivery =
    options.delivery === undefined ? "delivery-1" : options.delivery;
  const signature = options.signature === undefined ? sign(body) : options.signature;
  if (event !== null) headers.set("x-github-event", event);
  if (delivery !== null) headers.set("x-github-delivery", delivery);
  if (signature !== null) headers.set("x-hub-signature-256", signature);
  return new Request(URL, { method: "POST", headers, body });
}

interface Harness {
  deps: WebhookDeps;
  refreshes: Array<[string, string, number]>;
  linkedCalls: Array<[string, string, number]>;
  linked: Map<number, number[]>;
}

function harness(
  overrides: Partial<WebhookDeps> = {},
  linked = new Map<number, number[]>(),
): Harness {
  const refreshes: Array<[string, string, number]> = [];
  const linkedCalls: Array<[string, string, number]> = [];
  const deps: WebhookDeps = {
    credentials: () => ({ webhookSecret: SECRET }),
    refreshIssue: async (owner, repo, number) => {
      refreshes.push([owner, repo, number]);
    },
    linkedIssues: async (owner, repo, prNumber) => {
      linkedCalls.push([owner, repo, prNumber]);
      return linked.get(prNumber) ?? [];
    },
    now: () => NOW,
    ...overrides,
  };
  return { deps, refreshes, linkedCalls, linked };
}

beforeEach(() => {
  db.delete(stateWebhookDelivery).run();
  clearMirror();
  setConfig(TEST_CONFIG);
});

describe("verifyWebhookSignature", () => {
  test("accepts a valid sha256 HMAC over the raw bytes", () => {
    const body = payload({ action: "opened", issue: { number: 7 } });
    expect(
      verifyWebhookSignature(new TextEncoder().encode(body), sign(body), SECRET),
    ).toBe(true);
  });

  test("rejects an invalid digest", () => {
    const body = payload();
    const wrong = `sha256=${"0".repeat(64)}`;
    expect(
      verifyWebhookSignature(new TextEncoder().encode(body), wrong, SECRET),
    ).toBe(false);
  });

  test("rejects a missing or malformed header", () => {
    const bytes = new TextEncoder().encode(payload());
    expect(verifyWebhookSignature(bytes, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(bytes, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(bytes, "sha256=abc", SECRET)).toBe(false);
    expect(verifyWebhookSignature(bytes, `sha1=${"a".repeat(40)}`, SECRET)).toBe(
      false,
    );
    expect(verifyWebhookSignature(bytes, sign("x"), SECRET)).toBe(false);
  });

  test("rejects a signature made with another secret", () => {
    const body = payload();
    expect(
      verifyWebhookSignature(
        new TextEncoder().encode(body),
        sign(body, "a-different-secret"),
        SECRET,
      ),
    ).toBe(false);
  });

  test("verifies the raw bytes, not a re-serialised payload", () => {
    const raw = '{"action":"opened","issue":{"number":7}}';
    const pretty = '{"action": "opened", "issue": {"number": 7}}';
    const signature = sign(raw);
    expect(
      verifyWebhookSignature(new TextEncoder().encode(raw), signature, SECRET),
    ).toBe(true);
    expect(
      verifyWebhookSignature(new TextEncoder().encode(pretty), signature, SECRET),
    ).toBe(false);
  });

  test("handles an empty body", () => {
    const empty = new Uint8Array(0);
    expect(verifyWebhookSignature(empty, sign(""), SECRET)).toBe(true);
    expect(verifyWebhookSignature(empty, sign("x"), SECRET)).toBe(false);
  });
});

describe("handleWebhook", () => {
  test("acknowledges ping without refreshing", async () => {
    const { deps, refreshes } = harness();
    const body = payload();
    const response = await handleWebhook(
      webhookRequest(body, { event: "ping" }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(refreshes).toEqual([]);
    expect(webhookDeliveryExists("delivery-1")).toBe(true);
  });

  test("refreshes the issue in an issues event, including label actions", async () => {
    const { deps, refreshes } = harness();
    for (const action of ["opened", "labeled", "unlabeled"]) {
      const body = payload({ action, issue: { number: 7 } });
      const response = await handleWebhook(
        webhookRequest(body, { delivery: `delivery-${action}` }),
        deps,
      );
      expect(response.status).toBe(200);
    }
    expect(refreshes).toEqual([
      ["acme", "widgets", 7],
      ["acme", "widgets", 7],
      ["acme", "widgets", 7],
    ]);

    const row = db
      .select()
      .from(stateWebhookDelivery)
      .all()
      .find((delivery) => delivery.id === "delivery-unlabeled");
    expect(row).toMatchObject({
      event: "issues",
      action: "unlabeled",
      repo: "acme/widgets",
    });
  });

  test("refreshes the issue in an issue_comment event", async () => {
    const { deps, refreshes } = harness();
    const body = payload({
      action: "created",
      issue: { number: 11 },
      comment: { body: "private text" },
    });
    const response = await handleWebhook(webhookRequest(body, { event: "issue_comment" }), deps);
    expect(response.status).toBe(200);
    expect(refreshes).toEqual([["acme", "widgets", 11]]);
  });

  test("refreshes linked issues for pull request events", async () => {
    const linked = new Map<number, number[]>([[42, [3, 4]]]);
    const { deps, refreshes, linkedCalls } = harness({}, linked);
    for (const event of [
      "pull_request",
      "pull_request_review",
      "pull_request_review_comment",
    ]) {
      const body = payload({ action: "submitted", pull_request: { number: 42 } });
      const response = await handleWebhook(
        webhookRequest(body, { event, delivery: `delivery-${event}` }),
        deps,
      );
      expect(response.status).toBe(200);
    }
    expect(linkedCalls).toEqual([
      ["acme", "widgets", 42],
      ["acme", "widgets", 42],
      ["acme", "widgets", 42],
    ]);
    expect(refreshes).toEqual([
      ["acme", "widgets", 3],
      ["acme", "widgets", 4],
      ["acme", "widgets", 3],
      ["acme", "widgets", 4],
      ["acme", "widgets", 3],
      ["acme", "widgets", 4],
    ]);
  });

  test("uses the PR numbers in check events", async () => {
    const linked = new Map<number, number[]>([
      [42, [1]],
      [43, [2]],
    ]);
    for (const field of ["check_run", "check_suite"]) {
      db.delete(stateWebhookDelivery).run();
      const { deps, refreshes, linkedCalls } = harness({}, linked);
      const body = payload({
        action: "completed",
        [field]: {
          pull_requests: [{ number: 42 }, { number: 43 }, { number: 42 }],
        },
      });
      const response = await handleWebhook(
        webhookRequest(body, { event: field, delivery: `delivery-${field}` }),
        deps,
      );
      expect(response.status).toBe(200);
      expect(linkedCalls).toEqual([
        ["acme", "widgets", 42],
        ["acme", "widgets", 43],
      ]);
      expect(refreshes).toEqual([
        ["acme", "widgets", 1],
        ["acme", "widgets", 2],
      ]);
    }
  });

  test("accepts and records an unknown event without refreshing", async () => {
    const { deps, refreshes } = harness();
    const body = payload({ action: "created" });
    const response = await handleWebhook(
      webhookRequest(body, { event: "installation" }),
      deps,
    );
    expect(response.status).toBe(202);
    expect(refreshes).toEqual([]);
    expect(webhookDeliveryExists("delivery-1")).toBe(true);
  });

  test("accepts and ignores a payload without a usable repo or number", async () => {
    const { deps, refreshes } = harness();
    const missingRepo = JSON.stringify({ action: "opened", issue: { number: 7 } });
    const badNumber = payload({ action: "opened", issue: { number: "7" } });

    expect(
      (
        await handleWebhook(
          webhookRequest(missingRepo, { delivery: "no-repo" }),
          deps,
        )
      ).status,
    ).toBe(202);
    expect(
      (
        await handleWebhook(
          webhookRequest(badNumber, { delivery: "bad-number" }),
          deps,
        )
      ).status,
    ).toBe(202);
    expect(refreshes).toEqual([]);
    expect(db.select().from(stateWebhookDelivery).all()).toHaveLength(2);
  });

  test("falls back to repository.owner.login and repository.name", async () => {
    const { deps, refreshes } = harness();
    const body = JSON.stringify({
      action: "opened",
      issue: { number: 5 },
      repository: { name: "core", owner: { login: "orgA" } },
    });
    const response = await handleWebhook(webhookRequest(body), deps);
    expect(response.status).toBe(200);
    expect(refreshes).toEqual([["orgA", "core", 5]]);
  });

  test("rejects missing delivery or event headers", async () => {
    const { deps, refreshes } = harness();
    const body = payload({ action: "opened", issue: { number: 7 } });
    expect(
      (await handleWebhook(webhookRequest(body, { event: null }), deps)).status,
    ).toBe(400);
    expect(
      (await handleWebhook(webhookRequest(body, { delivery: null }), deps))
        .status,
    ).toBe(400);
    expect(refreshes).toEqual([]);
    expect(webhookDeliveryExists("delivery-1")).toBe(false);
  });

  test("rejects malformed JSON after a valid signature", async () => {
    const { deps, refreshes } = harness();
    const body = "{not json";
    const response = await handleWebhook(webhookRequest(body), deps);
    expect(response.status).toBe(400);
    expect(refreshes).toEqual([]);
    expect(webhookDeliveryExists("delivery-1")).toBe(false);
  });

  test("rejects missing and invalid signatures", async () => {
    const { deps, refreshes } = harness();
    const body = payload({ issue: { number: 7 } });
    expect(
      (
        await handleWebhook(webhookRequest(body, { signature: null }), deps)
      ).status,
    ).toBe(401);
    expect(
      (
        await handleWebhook(
          webhookRequest(body, { signature: sign(body, "wrong-secret") }),
          deps,
        )
      ).status,
    ).toBe(401);
    expect(refreshes).toEqual([]);
    expect(db.select().from(stateWebhookDelivery).all()).toHaveLength(0);
  });

  test("answers 503 when the App has no webhook secret", async () => {
    const { deps } = harness({
      credentials: () => ({ webhookSecret: null }),
    });
    const response = await handleWebhook(
      webhookRequest(payload({ issue: { number: 7 } })),
      deps,
    );
    expect(response.status).toBe(503);
  });

  test("answers 503 before onboarding", async () => {
    const { deps } = harness({ credentials: () => null });
    const response = await handleWebhook(
      webhookRequest(payload({ issue: { number: 7 } })),
      deps,
    );
    expect(response.status).toBe(503);
  });

  test("rejects an oversized declared body before verification", async () => {
    const { deps, refreshes } = harness();
    const response = await handleWebhook(
      new Request(URL, {
        method: "POST",
        headers: {
          "content-length": String(MAX_WEBHOOK_BYTES + 1),
          "x-github-event": "issues",
          "x-github-delivery": "too-big",
        },
        body: "{}",
      }),
      deps,
    );
    expect(response.status).toBe(413);
    expect(refreshes).toEqual([]);
  });

  test("rejects an oversized streamed body without content-length", async () => {
    const { deps } = harness();
    const chunk = new Uint8Array(3 * 1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const response = await handleWebhook(
      new Request(URL, {
        method: "POST",
        headers: {
          "x-github-event": "issues",
          "x-github-delivery": "too-big-stream",
        },
        body: stream,
        duplex: "half",
      } as RequestInit),
      deps,
    );
    expect(response.status).toBe(413);
  });

  test("acknowledges a duplicate delivery without refreshing again", async () => {
    const { deps, refreshes } = harness();
    const body = payload({ issue: { number: 7 } });
    const first = await handleWebhook(webhookRequest(body), deps);
    const second = await handleWebhook(webhookRequest(body), deps);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(refreshes).toEqual([["acme", "widgets", 7]]);
    expect(db.select().from(stateWebhookDelivery).all()).toHaveLength(1);
  });

  test("returns 500 and leaves no row when a refresh fails, then retries", async () => {
    const body = payload({ issue: { number: 7 } });
    let attempts = 0;
    const failing = harness({
      refreshIssue: async () => {
        attempts += 1;
        throw new Error("github unavailable");
      },
    });
    const first = await handleWebhook(webhookRequest(body), failing.deps);
    expect(first.status).toBe(500);
    expect(attempts).toBe(1);
    expect(webhookDeliveryExists("delivery-1")).toBe(false);

    const retry = harness();
    const second = await handleWebhook(webhookRequest(body), retry.deps);
    expect(second.status).toBe(200);
    expect(retry.refreshes).toEqual([["acme", "widgets", 7]]);
    expect(webhookDeliveryExists("delivery-1")).toBe(true);
  });

  test("isolates refresh failures and still tries the remaining issues", async () => {
    const linked = new Map<number, number[]>([[42, [1, 2, 3]]]);
    const attempted: number[] = [];
    const { deps } = harness(
      {
        refreshIssue: async (_owner, _repo, number) => {
          attempted.push(number);
          if (number === 2) throw new Error("boom");
        },
      },
      linked,
    );
    const response = await handleWebhook(
      webhookRequest(payload({ pull_request: { number: 42 } }), {
        event: "pull_request",
      }),
      deps,
    );
    expect(response.status).toBe(500);
    expect(attempted).toEqual([1, 2, 3]);
    expect(webhookDeliveryExists("delivery-1")).toBe(false);
  });

  test("caps refreshes at the per-delivery limit", async () => {
    const numbers = Array.from({ length: 25 }, (_value, index) => index + 1);
    const linked = new Map<number, number[]>([[42, numbers]]);
    const { deps, refreshes } = harness({}, linked);
    const response = await handleWebhook(
      webhookRequest(payload({ pull_request: { number: 42 } }), {
        event: "pull_request",
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(refreshes).toHaveLength(MAX_REFRESHES_PER_DELIVERY);
  });

  test("deduplicates linked issue numbers before refreshing", async () => {
    const linked = new Map<number, number[]>([
      [42, [1, 2]],
      [43, [2, 3]],
    ]);
    const { deps, refreshes } = harness({}, linked);
    const response = await handleWebhook(
      webhookRequest(
        payload({
          check_run: { pull_requests: [{ number: 42 }, { number: 43 }] },
        }),
        { event: "check_run" },
      ),
      deps,
    );
    expect(response.status).toBe(200);
    expect(refreshes).toEqual([
      ["acme", "widgets", 1],
      ["acme", "widgets", 2],
      ["acme", "widgets", 3],
    ]);
  });

  test("returns 500 when linked-issue resolution fails", async () => {
    const { deps } = harness({
      linkedIssues: async () => {
        throw new Error("mirror unavailable");
      },
    });
    const response = await handleWebhook(
      webhookRequest(payload({ pull_request: { number: 42 } }), {
        event: "pull_request",
      }),
      deps,
    );
    expect(response.status).toBe(500);
    expect(webhookDeliveryExists("delivery-1")).toBe(false);
  });

  test("prunes deliveries older than the retention window", async () => {
    db.insert(stateWebhookDelivery)
      .values({
        id: "stale",
        event: "issues",
        action: null,
        repo: null,
        receivedAt: NOW - DELIVERY_RETENTION_MS - 1,
      })
      .run();

    const { deps } = harness();
    const response = await handleWebhook(
      webhookRequest(payload({ issue: { number: 7 } })),
      deps,
    );
    expect(response.status).toBe(200);
    expect(webhookDeliveryExists("stale")).toBe(false);
    expect(webhookDeliveryExists("delivery-1")).toBe(true);
  });
});

describe("linkedIssuesForPullRequest", () => {
  test("finds the issues linked to a PR in the mirror", async () => {
    const repo = mirror.upsertRepo({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "acme",
      name: "widgets",
      url: "https://github.com/acme/widgets",
      archived: false,
    });
    mirror.replaceIssuePullRequestLinks(repo.id, 7, [
      { prNumber: 42, source: "closing" },
    ]);
    mirror.replaceIssuePullRequestLinks(repo.id, 8, [
      { prNumber: 42, source: "cross-reference" },
    ]);
    mirror.replaceIssuePullRequestLinks(repo.id, 9, [
      { prNumber: 43, source: "closing" },
    ]);

    expect(mirror.linkedIssueNumbersForPullRequest(repo.id, 42)).toEqual([
      7, 8,
    ]);
    expect(await linkedIssuesForPullRequest("acme", "widgets", 42)).toEqual([
      7, 8,
    ]);
  });

  test("returns nothing for an unknown repo or PR", async () => {
    expect(await linkedIssuesForPullRequest("acme", "missing", 42)).toEqual([]);
    const repo = mirror.upsertRepo({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "acme",
      name: "widgets",
      url: "https://github.com/acme/widgets",
      archived: false,
    });
    expect(await linkedIssuesForPullRequest("acme", "widgets", 99)).toEqual([]);
    expect(repo.id).toBeGreaterThan(0);
  });
});
