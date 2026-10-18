import { beforeEach, describe, expect, test } from "bun:test";
import type { Octokit } from "octokit";
import { setConfig } from "#lib/server/config";
import { resetEventBus, subscribe } from "#lib/server/sync/events";
import { TEST_CONFIG } from "#tests/test-config";
import {
  addIssueComment,
  addIssueLabels,
  createIssue,
  normalizeReserved,
  removeIssueLabel,
  updateIssue,
  withReserved,
} from "./mutations";

interface Call {
  route: string;
  params: Record<string, unknown>;
}

function stubOctokit(
  handler?: (call: Call) => { data?: unknown },
): { client: Octokit; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    request: async (route: string, params: Record<string, unknown> = {}) => {
      const call = { route, params };
      calls.push(call);
      return handler ? handler(call) : { data: {} };
    },
  } as unknown as Octokit;
  return { client, calls };
}

function createHandler(call: Call): { data: unknown } {
  return {
    data: {
      number: 42,
      html_url: `https://github.com/${call.params.owner}/${call.params.repo}/issues/42`,
    },
  };
}

beforeEach(() => {
  setConfig({ ...TEST_CONFIG, repos: ["orgA/core", "orgA/web"] });
  resetEventBus();
});

describe("normalizeReserved", () => {
  test("keeps the first label of each reserved group", () => {
    expect(normalizeReserved(["todo", "blocked", "bug", "p1", "p2"])).toEqual([
      "todo",
      "blocked",
      "bug",
      "p1",
    ]);
  });

  test("de-duplicates case-insensitively", () => {
    expect(normalizeReserved(["Bug", "bug", "TODO"])).toEqual(["Bug", "TODO"]);
  });
});

describe("withReserved", () => {
  test("swaps the sibling in the group", () => {
    expect(withReserved(["todo", "bug", "p2"], "status", "in-progress")).toEqual([
      "bug",
      "p2",
      "in-progress",
    ]);
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
});

describe("createIssue", () => {
  test("creates the issue with normalised labels and publishes", async () => {
    const { client, calls } = stubOctokit(createHandler);
    const events: Array<Record<string, unknown>> = [];
    subscribe((event) => events.push(event as Record<string, unknown>));

    const result = await createIssue({
      octokit: client,
      repo: "orgA/core",
      title: "New bug",
      body: "details",
      labels: ["bug"],
      status: "todo",
      priority: "p1",
      assignees: ["octocat"],
    });

    expect(result).toEqual({
      ok: true,
      value: { number: 42, htmlUrl: "https://github.com/orgA/core/issues/42" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].route).toBe("POST /repos/{owner}/{repo}/issues");
    expect(calls[0].params).toMatchObject({
      owner: "orgA",
      repo: "core",
      title: "New bug",
      body: "details",
      labels: ["bug", "todo", "p1"],
      assignees: ["octocat"],
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "issues", repo: "orgA/core", numbers: [42] }),
    );
  });

  test("rejects an unconfigured repository without a GitHub call", async () => {
    const { client, calls } = stubOctokit(createHandler);
    const result = await createIssue({
      octokit: client,
      repo: "evil/repo",
      title: "Nope",
    });
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("rejects a malformed repo", async () => {
    const { client } = stubOctokit(createHandler);
    const result = await createIssue({ octokit: client, repo: "core", title: "x" });
    expect((result as { status: number }).status).toBe(400);
  });

  test("maps upstream failures", async () => {
    const { client } = stubOctokit(() => {
      throw Object.assign(new Error("Validation Failed"), { status: 422 });
    });
    const result = await createIssue({
      octokit: client,
      repo: "orgA/core",
      title: "Bad",
    });
    expect(result).toEqual({ ok: false, status: 422, message: "Validation Failed" });
  });
});

describe("updateIssue", () => {
  test("patches title/body without touching labels", async () => {
    const { client, calls } = stubOctokit(() => ({
      data: { number: 5, html_url: "https://github.com/orgA/core/issues/5" },
    }));

    const result = await updateIssue({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      title: "Renamed",
      body: "New body",
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].route).toBe("PATCH /repos/{owner}/{repo}/issues/{issue_number}");
    expect(calls[0].params).toMatchObject({
      owner: "orgA",
      repo: "core",
      issue_number: 5,
      title: "Renamed",
      body: "New body",
    });
  });

  test("closes as completed and publishes", async () => {
    const { client, calls } = stubOctokit(() => ({
      data: { number: 5, html_url: "https://github.com/orgA/core/issues/5" },
    }));
    const events: Array<Record<string, unknown>> = [];
    subscribe((event) => events.push(event as Record<string, unknown>));

    const result = await updateIssue({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      state: "closed",
      stateReason: "completed",
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].route).toBe("PATCH /repos/{owner}/{repo}/issues/{issue_number}");
    expect(calls[0].params).toMatchObject({
      owner: "orgA",
      repo: "core",
      issue_number: 5,
      state: "closed",
      state_reason: "completed",
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "issues", repo: "orgA/core", numbers: [5] }),
    );
  });

  test("closes as not planned", async () => {
    const { client, calls } = stubOctokit(() => ({ data: {} }));

    await updateIssue({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      state: "closed",
      stateReason: "not_planned",
    });

    expect(calls[0].params).toMatchObject({
      state: "closed",
      state_reason: "not_planned",
    });
  });

  test("reopens with a null state reason", async () => {
    const { client, calls } = stubOctokit(() => ({ data: {} }));

    await updateIssue({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      state: "open",
      stateReason: null,
    });

    expect(calls[0].params).toMatchObject({ state: "open", state_reason: null });
  });

  test("swaps the reserved status label (GET then PUT)", async () => {
    const { client, calls } = stubOctokit((call) => {
      if (call.route.startsWith("GET")) {
        return { data: { labels: [{ name: "bug" }, { name: "todo" }, { name: "p2" }] } };
      }
      return { data: { html_url: "https://github.com/orgA/core/issues/5" } };
    });

    await updateIssue({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      status: "in-progress",
    });

    expect(calls.map((call) => call.route)).toEqual([
      "GET /repos/{owner}/{repo}/issues/{issue_number}",
      "PUT /repos/{owner}/{repo}/issues/{issue_number}/labels",
    ]);
    expect(calls[1].params.labels).toEqual(["bug", "p2", "in-progress"]);
  });

  test("clears the reserved status label with null", async () => {
    const { client, calls } = stubOctokit((call) =>
      call.route.startsWith("GET")
        ? { data: { labels: [{ name: "todo" }, { name: "bug" }] } }
        : { data: {} },
    );

    await updateIssue({ octokit: client, repo: "orgA/core", number: 5, status: null });

    expect(calls[1].params.labels).toEqual(["bug"]);
  });

  test("swaps priority and size in the same request", async () => {
    const { client, calls } = stubOctokit((call) =>
      call.route.startsWith("GET")
        ? { data: { labels: [{ name: "todo" }, { name: "bug" }] } }
        : { data: {} },
    );

    await updateIssue({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      priority: "p1",
      size: "md",
    });

    expect(calls[1].params.labels).toEqual(["todo", "bug", "p1", "md"]);
  });

  test("rejects an invalid reserved value", async () => {
    const { client, calls } = stubOctokit();
    const result = await updateIssue({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      status: "nope",
    });
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("rejects an empty update", async () => {
    const { client } = stubOctokit();
    const result = await updateIssue({ octokit: client, repo: "orgA/core", number: 5 });
    expect((result as { status: number }).status).toBe(400);
  });

  test("maps patch failures", async () => {
    const { client } = stubOctokit(() => {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    });
    const result = await updateIssue({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      title: "x",
    });
    expect(result).toEqual({ ok: false, status: 403, message: "Forbidden" });
  });
});

describe("addIssueLabels", () => {
  test("adds a non-reserved label", async () => {
    const { client, calls } = stubOctokit((call) =>
      call.route.startsWith("GET")
        ? { data: { labels: [{ name: "todo" }] } }
        : { data: {} },
    );

    const result = await addIssueLabels({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      labels: ["bug"],
    });

    expect(result).toEqual({ ok: true, value: { labels: ["bug"] } });
    expect(calls[1].params.labels).toEqual(["todo", "bug"]);
  });

  test("adds the blocked flag without disturbing the status", async () => {
    const { client, calls } = stubOctokit((call) =>
      call.route.startsWith("GET")
        ? { data: { labels: [{ name: "todo" }, { name: "bug" }] } }
        : { data: {} },
    );

    await addIssueLabels({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      labels: ["blocked"],
    });

    expect(calls[1].params.labels).toEqual(["todo", "bug", "blocked"]);
  });

  test("rejects an empty label list", async () => {
    const { client, calls } = stubOctokit();
    const result = await addIssueLabels({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      labels: [],
    });
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("maps upstream failures", async () => {
    const { client } = stubOctokit(() => {
      throw Object.assign(new Error("Unprocessable"), { status: 422 });
    });
    const result = await addIssueLabels({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      labels: ["bug"],
    });
    expect(result).toEqual({ ok: false, status: 422, message: "Unprocessable" });
  });
});

describe("removeIssueLabel", () => {
  test("deletes a single label and publishes", async () => {
    const { client, calls } = stubOctokit(() => ({ data: {} }));
    const events: Array<Record<string, unknown>> = [];
    subscribe((event) => events.push(event as Record<string, unknown>));

    const result = await removeIssueLabel({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      name: "bug",
    });

    expect(result).toEqual({ ok: true, value: { name: "bug" } });
    expect(calls[0].route).toBe(
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}",
    );
    expect(calls[0].params).toMatchObject({ issue_number: 5, name: "bug" });
    expect(events).toHaveLength(1);
  });

  test("maps failures", async () => {
    const { client } = stubOctokit(() => {
      throw Object.assign(new Error("Not Found"), { status: 404 });
    });
    const result = await removeIssueLabel({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      name: "ghost",
    });
    expect(result).toEqual({ ok: false, status: 404, message: "Not Found" });
  });
});

describe("addIssueComment", () => {
  test("posts the comment and returns its id", async () => {
    const { client, calls } = stubOctokit(() => ({
      data: { id: 9, html_url: "https://github.com/orgA/core/issues/5#issuecomment-9" },
    }));

    const result = await addIssueComment({
      octokit: client,
      repo: "orgA/core",
      number: 5,
      body: "hello",
    });

    expect(result).toEqual({
      ok: true,
      value: { id: 9, htmlUrl: "https://github.com/orgA/core/issues/5#issuecomment-9" },
    });
    expect(calls[0].route).toBe(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    );
    expect(calls[0].params).toMatchObject({ issue_number: 5, body: "hello" });
  });

  test("maps comment failures", async () => {
    const { client } = stubOctokit(() => {
      throw Object.assign(new Error("Resource not accessible"), { status: 403 });
    });
    const result = await addIssueComment({
      octokit: client,
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
