import { beforeEach, describe, expect, test } from "bun:test";
import type { Octokit } from "octokit";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import { resetEventBus, subscribe } from "#lib/server/sync/events";
import { upsertIssue, upsertRepo } from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import {
  acceptSubmission,
  dismissSubmission,
  duplicateSubmission,
} from "./actions";
import { createSubmission, getSubmission } from "./staging";

interface Call {
  route: string;
  params: Record<string, unknown>;
}

/**
 * The actions only touch `octokit.request`, so tests inject a capture stub
 * instead of stubbing `fetch`. `as unknown as Octokit` keeps the real call
 * signature at the call sites.
 */
function stubOctokit(
  handler?: (call: Call) => { data?: unknown },
): { client: Octokit; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    request: async (route: string, params: Record<string, unknown> = {}) => {
      const call = { route, params };
      calls.push(call);
      return handler
        ? handler(call)
        : {
            data: {
              number: 42,
              html_url: "https://github.com/orgA/core/issues/42",
            },
          };
    },
  } as unknown as Octokit;
  return { client, calls };
}

function seedIssue(): void {
  upsertRepo({ githubId: 1, org: "orgA", name: "core", archived: false });
  upsertIssue(
    {
      githubId: 100,
      repoId: 1,
      number: 5,
      title: "Existing issue",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      createdAt: 1,
      updatedAt: 1,
      closedAt: null,
      labels: [],
      assignees: [],
      comments: [],
    },
    { status: "todo", size: null, blocked: false, labelConflict: false },
  );
}

beforeEach(() => {
  db.delete(stateIntakeSubmission).run();
  clearMirror();
  resetEventBus();
  setConfig(TEST_CONFIG);
});

describe("acceptSubmission", () => {
  test("creates the issue, adds default status + provenance, clears the queue", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({
      title: "Crash on save",
      body: "Steps to reproduce",
      source: "cli",
    });
    const events: Array<Record<string, unknown>> = [];
    subscribe((event) => events.push(event as Record<string, unknown>));
    const { client, calls } = stubOctokit();

    const result = await acceptSubmission({ id, octokit: client });

    expect(result).toEqual({
      ok: true,
      value: { number: 42, htmlUrl: "https://github.com/orgA/core/issues/42" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].route).toBe("POST /repos/{owner}/{repo}/issues");
    expect(calls[0].params).toMatchObject({
      owner: "orgA",
      repo: "core",
      title: "Crash on save",
      body: "Steps to reproduce\n\n_Submitted via Funnel intake (source: cli)_",
      labels: ["backlog"],
    });
    expect(getSubmission(id)).toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({ type: "intake", action: "accepted", id }),
    );
  });

  test("honors an explicit repo selector and extra labels/assignees", async () => {
    setConfig({
      ...TEST_CONFIG,
      repos: [
        { repo: "orgA/core", shortcode: "CORE" },
        { repo: "orgA/web", shortcode: "WEB" },
      ],
      intake: { default_repo: "orgA/core" },
    });
    const { id } = createSubmission({ title: "Route elsewhere" });
    const { client, calls } = stubOctokit();

    await acceptSubmission({
      id,
      octokit: client,
      repo: "orgA/web",
      labels: ["bug", "backlog"],
      assignees: ["octocat"],
    });

    expect(calls[0].params).toMatchObject({
      owner: "orgA",
      repo: "web",
      labels: ["backlog", "bug"],
      assignees: ["octocat"],
    });
  });

  test("omits the source segment when none was given", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "No source", body: "hello" });
    const { client, calls } = stubOctokit();

    await acceptSubmission({ id, octokit: client });

    expect(calls[0].params.body).toBe(
      "hello\n\n_Submitted via Funnel intake_",
    );
  });

  test("rejects a repo outside the configured set and retains the row", async () => {
    const { id } = createSubmission({ title: "Bad repo" });
    const { client, calls } = stubOctokit();

    const result = await acceptSubmission({
      id,
      octokit: client,
      repo: "evil/repo",
    });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(getSubmission(id)).toBeDefined();
  });

  test("requires a repo when no default is configured", async () => {
    const { id } = createSubmission({ title: "No target" });
    const { client } = stubOctokit();

    const result = await acceptSubmission({ id, octokit: client });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(400);
    expect(getSubmission(id)).toBeDefined();
  });

  test("keeps the row when GitHub rejects the create", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "Upstream fails" });
    const { client } = stubOctokit(() => {
      throw Object.assign(new Error("Validation Failed"), { status: 422 });
    });

    const result = await acceptSubmission({ id, octokit: client });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(422);
    expect(getSubmission(id)).toBeDefined();
  });

  test("maps a status-less upstream error to 502", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "Network blip" });
    const { client } = stubOctokit(() => {
      throw new Error("socket hang up");
    });

    const result = await acceptSubmission({ id, octokit: client });

    expect(result).toEqual({ ok: false, status: 502, message: "socket hang up" });
    expect(getSubmission(id)).toBeDefined();
  });

  test("unknown submission is a 404", async () => {
    const { client, calls } = stubOctokit();
    const result = await acceptSubmission({ id: "nope", octokit: client });
    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Submission not found",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("dismissSubmission", () => {
  test("hard-deletes without any GitHub call", () => {
    const { id } = createSubmission({ title: "Drop" });
    const result = dismissSubmission({ id });
    expect(result).toEqual({ ok: true, value: { id } });
    expect(getSubmission(id)).toBeUndefined();
  });

  test("unknown submission is a 404", () => {
    expect(dismissSubmission({ id: "nope" })).toEqual({
      ok: false,
      status: 404,
      message: "Submission not found",
    });
  });
});

describe("duplicateSubmission", () => {
  test("comments the submission text on the mirrored issue and clears the queue", async () => {
    seedIssue();
    const { id } = createSubmission({
      title: "Crash on save",
      body: "Steps to reproduce",
      source: "email",
    });
    const { client, calls } = stubOctokit(() => ({
      data: {
        html_url: "https://github.com/orgA/core/issues/5#issuecomment-1",
      },
    }));

    const result = await duplicateSubmission({
      id,
      octokit: client,
      repo: "orgA/core",
      number: 5,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        number: 5,
        htmlUrl: "https://github.com/orgA/core/issues/5#issuecomment-1",
      },
    });
    expect(calls[0].route).toBe(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    );
    expect(calls[0].params).toMatchObject({
      owner: "orgA",
      repo: "core",
      issue_number: 5,
    });
    expect(calls[0].params.body).toBe(
      "**Crash on save**\n\nSteps to reproduce\n\n_Submitted via Funnel intake (source: email)_",
    );
    expect(getSubmission(id)).toBeUndefined();
  });

  test("rejects an unmirrored repo without a GitHub call", async () => {
    const { id } = createSubmission({ title: "Nowhere" });
    const { client, calls } = stubOctokit();

    const result = await duplicateSubmission({
      id,
      octokit: client,
      repo: "orgA/ghost",
      number: 1,
    });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(404);
    expect(calls).toHaveLength(0);
    expect(getSubmission(id)).toBeDefined();
  });

  test("rejects an unmirrored issue number", async () => {
    seedIssue();
    const { id } = createSubmission({ title: "Missing issue" });
    const { client, calls } = stubOctokit();

    const result = await duplicateSubmission({
      id,
      octokit: client,
      repo: "orgA/core",
      number: 999,
    });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  test("unknown submission is a 404", async () => {
    seedIssue();
    const { client, calls } = stubOctokit();
    const result = await duplicateSubmission({
      id: "nope",
      octokit: client,
      repo: "orgA/core",
      number: 5,
    });
    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Submission not found",
    });
    expect(calls).toHaveLength(0);
  });

  test("keeps the row when the comment post fails", async () => {
    seedIssue();
    const { id } = createSubmission({ title: "Comment fails" });
    const { client } = stubOctokit(() => {
      throw Object.assign(new Error("Resource not accessible"), { status: 403 });
    });

    const result = await duplicateSubmission({
      id,
      octokit: client,
      repo: "orgA/core",
      number: 5,
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Resource not accessible",
    });
    expect(getSubmission(id)).toBeDefined();
  });
});
