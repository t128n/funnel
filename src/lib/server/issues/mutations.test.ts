import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildVocabulary } from "#lib/labels";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateSnooze } from "#lib/server/db/schema";
import type { GitHubProvider } from "#lib/server/forge/providers.server";
import { resetEventBus, subscribe } from "#lib/server/sync/events";
import { TEST_CONFIG } from "#tests/test-config";
import {
  addIssueComment,
  addIssueLabels,
  createIssue,
  createMilestone,
  deleteIssueComment,
  normalizeReserved,
  removeIssueLabel,
  setCommentReaction,
  updateIssue,
  updateIssueComment,
  withReserved,
} from "./mutations";
import { isIssueSnoozed, snoozeIssue } from "#lib/server/snooze";

interface Call {
  op: string;
  args: unknown[];
}

function issueThread(
  ref: unknown,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ref,
    kind: "issue",
    title: "x",
    state: "open",
    labels: [],
    assignees: [],
    reviewers: [],
    isDraft: false,
    url: "https://github.com/orgA/core/issues/5",
    raw: {},
    ...overrides,
  };
}

interface StubOptions {
  labels?: string[];
  fail?: { op: string; error: Error };
}

function stubProvider(options: StubOptions = {}): {
  provider: GitHubProvider;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fail = (op: string) => {
    if (options.fail?.op === op) throw options.fail.error;
  };
  const labels = () => (options.labels ?? []).map((name) => ({ name }));

  const provider = {
    threads: {
      create: async (repo: { owner: string; name: string }, input: unknown) => {
        calls.push({ op: "create", args: [repo, input] });
        fail("create");
        return issueThread(
          { ...repo, kind: "issue", number: "42" },
          { url: `https://github.com/${repo.owner}/${repo.name}/issues/42` },
        );
      },
      get: async (ref: unknown) => {
        calls.push({ op: "get", args: [ref] });
        fail("get");
        return issueThread(ref, { labels: labels() });
      },
      update: async (ref: unknown, input: unknown) => {
        calls.push({ op: "update", args: [ref, input] });
        fail("update");
        return issueThread(ref);
      },
      close: async (ref: unknown, opts: unknown) => {
        calls.push({ op: "close", args: [ref, opts] });
        fail("close");
        return issueThread(ref, { state: "closed" });
      },
      setLabels: async (ref: unknown, names: string[]) => {
        calls.push({ op: "setLabels", args: [ref, names] });
        fail("setLabels");
        return names.map((name) => ({ name }));
      },
      setMilestone: async (ref: unknown, milestone: unknown) => {
        calls.push({ op: "setMilestone", args: [ref, milestone] });
        fail("setMilestone");
        return { id: "3", title: "v1", state: "open", raw: {} };
      },
      removeLabels: async (ref: unknown, names: string[]) => {
        calls.push({ op: "removeLabels", args: [ref, names] });
        fail("removeLabels");
        return [];
      },
      createComment: async (ref: unknown, body: string) => {
        calls.push({ op: "createComment", args: [ref, body] });
        fail("createComment");
        return {
          id: "9",
          body,
          url: "https://github.com/orgA/core/issues/5#issuecomment-9",
          raw: {},
        };
      },
      updateComment: async (ref: unknown, body: string) => {
        calls.push({ op: "updateComment", args: [ref, body] });
        fail("updateComment");
        return {
          id: "9",
          body,
          url: "https://github.com/orgA/core/issues/5#issuecomment-9",
          updatedAt: new Date(1_700_000_000_000),
          raw: {},
        };
      },
      deleteComment: async (ref: unknown) => {
        calls.push({ op: "deleteComment", args: [ref] });
        fail("deleteComment");
      },
      react: async (ref: unknown, content: string) => {
        calls.push({ op: "react", args: [ref, content] });
        fail("react");
      },
      unreact: async (ref: unknown, content: string) => {
        calls.push({ op: "unreact", args: [ref, content] });
        fail("unreact");
      },
    },
    request: async (method: string, path: string, init: unknown) => {
      calls.push({ op: "request", args: [method, path, init] });
      fail("request");
      return {
        status: 201,
        data: {
          number: 3,
          id: 33,
          title: "v1",
          state: "open",
          open_issues: 0,
          closed_issues: 0,
          html_url: "https://github.com/orgA/core/milestone/3",
        },
        headers: new Headers(),
      };
    },
  };

  return { provider: provider as unknown as GitHubProvider, calls };
}

function ops(calls: Call[]): string[] {
  return calls.map((call) => call.op);
}

beforeEach(() => {
  db.delete(stateSnooze).run();
  setConfig({
    ...TEST_CONFIG,
    repos: [
      { repo: "orgA/core", shortcode: "CORE" },
      { repo: "orgA/web", shortcode: "WEB" },
    ],
  });
  resetEventBus();
});

afterEach(() => {
  db.delete(stateSnooze).run();
});

describe("normalizeReserved", () => {
  test("keeps the first label of each reserved group", () => {
    expect(normalizeReserved(["todo", "blocked", "bug", "sev", "mod"])).toEqual([
      "todo",
      "blocked",
      "bug",
      "sev",
    ]);
  });

  test("de-duplicates case-insensitively", () => {
    expect(normalizeReserved(["Bug", "bug", "TODO"])).toEqual(["Bug", "TODO"]);
  });
});

describe("withReserved", () => {
  test("swaps the sibling in the group", () => {
    expect(
      withReserved(["todo", "bug", "p2"], "status", "in-progress"),
    ).toEqual(["bug", "p2", "in-progress"]);
  });

  test("clears the group when the target is null", () => {
    expect(withReserved(["todo", "bug"], "status", null)).toEqual(["bug"]);
  });

  test("toggles the orthogonal blocked flag without touching status", () => {
    expect(withReserved(["todo", "bug"], "flags", "blocked")).toEqual([
      "todo",
      "bug",
      "blocked",
    ]);
    expect(withReserved(["todo", "blocked", "bug"], "flags", null)).toEqual([
      "todo",
      "bug",
    ]);
  });

  test("maps logical targets to actual prefixed names", () => {
    const vocabulary = buildVocabulary("funnel");
    expect(
      withReserved(
        ["funnel-todo", "bug", "p2"],
        "status",
        "in-progress",
        vocabulary,
      ),
    ).toEqual(["bug", "p2", "funnel-in-progress"]);
    expect(
      withReserved(["funnel-todo", "bug"], "status", null, vocabulary),
    ).toEqual(["bug"]);
  });

  test("normalizes prefixed groups with the configured vocabulary", () => {
    const vocabulary = buildVocabulary("funnel");
    expect(
      normalizeReserved(
        ["funnel-todo", "funnel-blocked", "bug", "funnel-sev", "funnel-mod"],
        vocabulary,
      ),
    ).toEqual(["funnel-todo", "funnel-blocked", "bug", "funnel-sev"]);
  });
});

describe("createIssue", () => {
  test("creates the issue with normalised labels and publishes", async () => {
    const { provider, calls } = stubProvider();
    const events: Array<Record<string, unknown>> = [];
    subscribe((event) => events.push(event as Record<string, unknown>));

    const result = await createIssue({
      provider,
      repo: "orgA/core",
      title: "New bug",
      body: "details",
      labels: ["bug"],
      status: "todo",
      impact: "sev",
      assignees: ["octocat"],
    });

    expect(result).toEqual({
      ok: true,
      value: { number: 42, htmlUrl: "https://github.com/orgA/core/issues/42" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("create");

    const [repo, input] = calls[0].args as [
      { forge: string; instance: string; owner: string; name: string },
      {
        kind: string;
        title: string;
        body: string;
        labels: string[];
        assignees?: string[];
      },
    ];
    expect(repo).toMatchObject({
      forge: "github",
      instance: "github.com",
      owner: "orgA",
      name: "core",
    });
    expect(input).toMatchObject({
      kind: "issue",
      title: "New bug",
      body: "details",
      labels: ["bug", "todo", "sev"],
      assignees: ["octocat"],
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "issues",
        repo: "orgA/core",
        numbers: [42],
      }),
    );
  });

  test("rejects an unconfigured repository without a forge call", async () => {
    const { provider, calls } = stubProvider();
    const result = await createIssue({
      provider,
      repo: "evil/repo",
      title: "Nope",
    });
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("writes prefixed names for logical shortcuts", async () => {
    setConfig({ ...TEST_CONFIG, labels: { prefix: "funnel" } });
    const { provider, calls } = stubProvider();

    await createIssue({
      provider,
      repo: "orgA/core",
      title: "Prefixed",
      status: "todo",
      impact: "sev",
      urgency: "high",
      size: "md",
    });

    const input = calls.find((call) => call.op === "create")?.args[1] as {
      labels: string[];
    };
    expect(input.labels).toEqual([
      "funnel-todo",
      "funnel-sev",
      "funnel-high",
      "funnel-md",
    ]);
  });

  test("rejects a malformed repo", async () => {
    const { provider } = stubProvider();
    const result = await createIssue({ provider, repo: "core", title: "x" });
    expect((result as { status: number }).status).toBe(400);
  });

  test("maps upstream failures", async () => {
    const { provider } = stubProvider({
      fail: {
        op: "create",
        error: Object.assign(new Error("Validation Failed"), { status: 422 }),
      },
    });
    const result = await createIssue({
      provider,
      repo: "orgA/core",
      title: "Bad",
    });
    expect(result).toEqual({
      ok: false,
      status: 422,
      message: "Validation Failed",
    });
  });
});

describe("updateIssue", () => {
  test("patches title/body without touching labels", async () => {
    const { provider, calls } = stubProvider();

    const result = await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      title: "Renamed",
      body: "New body",
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("update");
    expect(calls[0].args[1]).toMatchObject({
      title: "Renamed",
      body: "New body",
    });
  });

  test("closes as completed and publishes", async () => {
    const { provider, calls } = stubProvider();
    const events: Array<Record<string, unknown>> = [];
    subscribe((event) => events.push(event as Record<string, unknown>));

    const result = await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      state: "closed",
      stateReason: "completed",
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("close");
    expect(calls[0].args[1]).toMatchObject({ reason: "completed" });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "issues",
        repo: "orgA/core",
        numbers: [5],
      }),
    );
  });

  test("closes as not planned", async () => {
    const { provider, calls } = stubProvider();

    await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      state: "closed",
      stateReason: "not_planned",
    });

    expect(calls[0].op).toBe("close");
    expect(calls[0].args[1]).toMatchObject({ reason: "not_planned" });
  });

  test("reopens with a null state reason", async () => {
    const { provider, calls } = stubProvider();

    await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      state: "open",
      stateReason: null,
    });

    expect(ops(calls)).toEqual(["update"]);
    expect(calls[0].args[1]).toMatchObject({ state: "open" });
  });

  test("closes with a reason, sets the milestone, and replaces labels", async () => {
    const { provider, calls } = stubProvider();

    const result = await updateIssue({
      provider,
      repo: "orgA/core",
      number: 7,
      state: "closed",
      stateReason: "completed",
      milestone: 3,
      status: "backlog",
    });

    expect(result.ok).toBe(true);
    expect(ops(calls)).toEqual(["close", "setMilestone", "get", "setLabels"]);
    expect(calls[0].args[1]).toMatchObject({ reason: "completed" });
    expect(calls[1].args[1]).toBe("3");
    expect(calls[3].args[1]).toEqual(["backlog"]);
  });

  test("clears the milestone", async () => {
    const { provider, calls } = stubProvider();

    await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      milestone: null,
    });

    expect(ops(calls)).toEqual(["setMilestone"]);
    expect(calls[0].args[1]).toBeUndefined();
  });

  test("rejects an invalid milestone", async () => {
    const { provider, calls } = stubProvider();
    const result = await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      milestone: 0,
    });
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("swaps the reserved status label (get then setLabels)", async () => {
    const { provider, calls } = stubProvider({
      labels: ["bug", "todo", "p2"],
    });

    await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      status: "in-progress",
    });

    expect(ops(calls)).toEqual(["get", "setLabels"]);
    expect(calls[1].args[1]).toEqual(["bug", "p2", "in-progress"]);
  });

  test("clears the reserved status label with null", async () => {
    const { provider, calls } = stubProvider({ labels: ["todo", "bug"] });

    await updateIssue({ provider, repo: "orgA/core", number: 5, status: null });

    expect(calls[1].args[1]).toEqual(["bug"]);
  });

  test("clears an issue snooze when the status changes", async () => {
    const { provider } = stubProvider();
    expect(snoozeIssue("orgA/core", 5, Date.now() + 60_000).ok).toBe(true);
    expect(isIssueSnoozed("orgA/core", 5)).toBe(true);

    await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      status: "todo",
    });

    expect(isIssueSnoozed("orgA/core", 5)).toBe(false);
  });

  test("keeps an issue snooze on a non-status edit", async () => {
    const { provider } = stubProvider();
    expect(snoozeIssue("orgA/core", 5, Date.now() + 60_000).ok).toBe(true);

    await updateIssue({ provider, repo: "orgA/core", number: 5, title: "Rename" });

    expect(isIssueSnoozed("orgA/core", 5)).toBe(true);
  });

  test("swaps impact and size in the same request", async () => {
    const { provider, calls } = stubProvider({ labels: ["todo", "bug"] });

    await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      impact: "mod",
      size: "md",
    });

    expect(calls[1].args[1]).toEqual(["todo", "bug", "mod", "md"]);
  });

  test("swaps prefixed group members when a prefix is configured", async () => {
    setConfig({ ...TEST_CONFIG, labels: { prefix: "funnel" } });
    const { provider, calls } = stubProvider({
      labels: ["funnel-todo", "bug", "funnel-sev", "funnel-mid", "todo"],
    });

    await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      status: "in-progress",
      impact: "mod",
      size: "lg",
    });

    expect(calls[1].args[1]).toEqual([
      "bug",
      "funnel-mid",
      "todo",
      "funnel-in-progress",
      "funnel-mod",
      "funnel-lg",
    ]);
  });

  test("rejects an invalid reserved value", async () => {
    const { provider, calls } = stubProvider();
    const result = await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      status: "nope",
    });
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("rejects an empty update", async () => {
    const { provider } = stubProvider();
    const result = await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
    });
    expect((result as { status: number }).status).toBe(400);
  });

  test("maps patch failures", async () => {
    const { provider } = stubProvider({
      fail: {
        op: "update",
        error: Object.assign(new Error("Forbidden"), { status: 403 }),
      },
    });
    const result = await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      title: "x",
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Forbidden (some changes may already have been applied)",
    });
  });

  test("warns that earlier writes may have been applied when setLabels fails", async () => {
    const { provider, calls } = stubProvider({
      fail: {
        op: "setLabels",
        error: Object.assign(new Error("Unprocessable"), { status: 422 }),
      },
    });
    const result = await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      title: "Renamed",
      status: "in-progress",
    });
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toContain(
      "(some changes may already have been applied)",
    );
    expect(ops(calls)).toEqual(["update", "get", "setLabels"]);
  });
});

describe("addIssueLabels", () => {
  test("adds a non-reserved label", async () => {
    const { provider, calls } = stubProvider({ labels: ["todo"] });

    const result = await addIssueLabels({
      provider,
      repo: "orgA/core",
      number: 5,
      labels: ["bug"],
    });

    expect(result).toEqual({ ok: true, value: { labels: ["bug"] } });
    expect(calls[1].args[1]).toEqual(["todo", "bug"]);
  });

  test("adds the blocked flag without disturbing the status", async () => {
    const { provider, calls } = stubProvider({ labels: ["todo", "bug"] });

    await addIssueLabels({
      provider,
      repo: "orgA/core",
      number: 5,
      labels: ["blocked"],
    });

    expect(calls[1].args[1]).toEqual(["todo", "bug", "blocked"]);
  });

  test("rejects an empty label list", async () => {
    const { provider, calls } = stubProvider();
    const result = await addIssueLabels({
      provider,
      repo: "orgA/core",
      number: 5,
      labels: [],
    });
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("maps upstream failures", async () => {
    const { provider } = stubProvider({
      fail: {
        op: "get",
        error: Object.assign(new Error("Unprocessable"), { status: 422 }),
      },
    });
    const result = await addIssueLabels({
      provider,
      repo: "orgA/core",
      number: 5,
      labels: ["bug"],
    });
    expect(result).toEqual({
      ok: false,
      status: 422,
      message: "Unprocessable",
    });
  });
});

describe("removeIssueLabel", () => {
  test("deletes a single label and publishes", async () => {
    const { provider, calls } = stubProvider();
    const events: Array<Record<string, unknown>> = [];
    subscribe((event) => events.push(event as Record<string, unknown>));

    const result = await removeIssueLabel({
      provider,
      repo: "orgA/core",
      number: 5,
      name: "bug",
    });

    expect(result).toEqual({ ok: true, value: { name: "bug" } });
    expect(calls[0].op).toBe("removeLabels");
    expect(calls[0].args[1]).toEqual(["bug"]);
    expect(events).toHaveLength(1);
  });

  test("maps failures", async () => {
    const { provider } = stubProvider({
      fail: {
        op: "removeLabels",
        error: Object.assign(new Error("Not Found"), { status: 404 }),
      },
    });
    const result = await removeIssueLabel({
      provider,
      repo: "orgA/core",
      number: 5,
      name: "ghost",
    });
    expect(result).toEqual({ ok: false, status: 404, message: "Not Found" });
  });
});

describe("addIssueComment", () => {
  test("posts the comment and returns its id", async () => {
    const { provider, calls } = stubProvider();

    const result = await addIssueComment({
      provider,
      repo: "orgA/core",
      number: 5,
      body: "hello",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: 9,
        htmlUrl: "https://github.com/orgA/core/issues/5#issuecomment-9",
      },
    });
    expect(calls[0].op).toBe("createComment");
    expect(calls[0].args[1]).toBe("hello");
  });

  test("maps comment failures", async () => {
    const { provider } = stubProvider({
      fail: {
        op: "createComment",
        error: Object.assign(new Error("Resource not accessible"), {
          status: 403,
        }),
      },
    });
    const result = await addIssueComment({
      provider,
      repo: "orgA/core",
      number: 5,
      body: "x",
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Resource not accessible",
    });
  });
});

describe("comment lifecycle", () => {
  test("edits a comment through the provider with a comment ref", async () => {
    const { provider, calls } = stubProvider();

    const result = await updateIssueComment({
      provider,
      repo: "orgA/core",
      number: 5,
      commentId: 9,
      body: "rewritten",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: 9,
        htmlUrl: "https://github.com/orgA/core/issues/5#issuecomment-9",
        updatedAt: 1_700_000_000_000,
      },
    });
    expect(calls[0].op).toBe("updateComment");
    expect(calls[0].args[1]).toBe("rewritten");
    expect(calls[0].args[0]).toMatchObject({
      id: "9",
      thread: { kind: "issue", number: "5" },
    });
  });

  test("maps a forbidden comment edit to a clear permission message", async () => {
    const { provider } = stubProvider({
      fail: {
        op: "updateComment",
        error: Object.assign(new Error("Resource not accessible by integration"), {
          status: 403,
        }),
      },
    });
    const result = await updateIssueComment({
      provider,
      repo: "orgA/core",
      number: 5,
      commentId: 9,
      body: "x",
    });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 403 });
    expect((result as { message: string }).message).toContain(
      "GitHub denied permission to edit comment 9",
    );
  });

  test("deletes a comment and rejects an invalid id without a call", async () => {
    const { provider, calls } = stubProvider();
    const result = await deleteIssueComment({
      provider,
      repo: "orgA/core",
      number: 5,
      commentId: 9,
    });
    expect(result).toEqual({ ok: true, value: { id: 9 } });
    expect(calls[0].op).toBe("deleteComment");

    const invalid = await deleteIssueComment({
      provider,
      repo: "orgA/core",
      number: 5,
      commentId: 0,
    });
    expect((invalid as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  test("adds and removes a reaction by content", async () => {
    const { provider, calls } = stubProvider();

    const added = await setCommentReaction({
      provider,
      repo: "orgA/core",
      number: 5,
      commentId: 9,
      content: "heart",
      active: true,
    });
    const removed = await setCommentReaction({
      provider,
      repo: "orgA/core",
      number: 5,
      commentId: 9,
      content: "heart",
      active: false,
    });

    expect(added).toEqual({
      ok: true,
      value: { id: 9, content: "heart", reacted: true },
    });
    expect(removed).toEqual({
      ok: true,
      value: { id: 9, content: "heart", reacted: false },
    });
    expect(calls.map((call) => call.op)).toEqual(["react", "unreact"]);
    expect(calls[0].args[1]).toBe("heart");
  });

  test("maps a forbidden reaction with the same permission hint", async () => {
    const { provider } = stubProvider({
      fail: {
        op: "react",
        error: Object.assign(new Error("Resource not accessible"), { status: 403 }),
      },
    });
    const result = await setCommentReaction({
      provider,
      repo: "orgA/core",
      number: 5,
      commentId: 9,
      content: "+1",
      active: true,
    });
    expect((result as { message: string }).message).toContain(
      "GitHub denied permission to react to comment 9",
    );
  });
});

describe("createMilestone", () => {
  test("creates a milestone through the raw request", async () => {
    const { provider, calls } = stubProvider();

    const result = await createMilestone({
      provider,
      repo: "orgA/core",
      title: " v1 ",
    });

    expect(result).toEqual({
      ok: true,
      value: { number: 3, htmlUrl: "https://github.com/orgA/core/milestone/3" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("request");
    expect(calls[0].args[0]).toBe("POST");
    expect(calls[0].args[1]).toBe("/repos/orgA/core/milestones");
    expect(calls[0].args[2]).toMatchObject({ body: { title: "v1" } });
  });

  test("rejects an empty title without a forge call", async () => {
    const { provider, calls } = stubProvider();
    const result = await createMilestone({
      provider,
      repo: "orgA/core",
      title: "   ",
    });
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("impact and urgency", () => {
  test("create applies the impact and urgency shortcuts", async () => {
    const { provider, calls } = stubProvider();
    await createIssue({
      provider,
      repo: "orgA/core",
      title: "Triage inputs",
      status: "backlog",
      impact: "sev",
      urgency: "high",
    });
    const input = calls.find((c) => c.op === "create")?.args[1] as {
      labels: string[];
    };
    expect(input.labels).toEqual(["backlog", "sev", "high"]);
  });

  test("create strips retired priority labels", async () => {
    const { provider, calls } = stubProvider();
    await createIssue({
      provider,
      repo: "orgA/core",
      title: "Legacy label",
      labels: ["bug", "p1", "P2"],
    });
    const input = calls.find((c) => c.op === "create")?.args[1] as {
      labels: string[];
    };
    expect(input.labels).toEqual(["bug"]);
  });

  test("update swaps an impact label without touching urgency", async () => {
    const { provider, calls } = stubProvider({
      labels: ["todo", "sev", "mid"],
    });
    await updateIssue({
      provider,
      repo: "orgA/core",
      number: 5,
      impact: "mod",
    });
    const set = calls.find((c) => c.op === "setLabels")?.args[1];
    expect(set).toEqual(["todo", "mid", "mod"]);
  });
});
