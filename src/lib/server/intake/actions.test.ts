import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import type { GitHubProvider } from "#lib/server/forge/providers.server";
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
  op: string;
  args: unknown[];
}

/**
 * The actions write through the provider layer, so tests inject a capture stub
 * instead of stubbing `fetch`. `as unknown as GitHubProvider` keeps the real
 * call signature at the call sites.
 */
function stubProvider(
  handler?: (call: Call) => void,
): { provider: GitHubProvider; calls: Call[] } {
  const calls: Call[] = [];
  const record = (op: string, args: unknown[]) => {
    const call = { op, args };
    calls.push(call);
    handler?.(call);
  };

  const provider = {
    threads: {
      create: async (
        repo: { owner: string; name: string },
        input: { title: string },
      ) => {
        record("create", [repo, input]);
        return {
          ref: { ...repo, kind: "issue", number: "42" },
          kind: "issue",
          title: input.title,
          state: "open",
          labels: [],
          assignees: [],
          url: `https://github.com/${repo.owner}/${repo.name}/issues/42`,
        };
      },
      createComment: async (ref: unknown, body: string) => {
        record("createComment", [ref, body]);
        return {
          id: "1",
          body,
          url: "https://github.com/orgA/core/issues/5#issuecomment-1",
          raw: {},
        };
      },
    },
  } as unknown as GitHubProvider;
  return { provider, calls };
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
    { status: "todo", priority: null, size: null, blocked: false, labelConflict: false },
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
    const { provider, calls } = stubProvider();

    const result = await acceptSubmission({ id, provider });

    expect(result).toEqual({
      ok: true,
      value: { number: 42, htmlUrl: "https://github.com/orgA/core/issues/42" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("create");
    expect(calls[0].args[0]).toMatchObject({ owner: "orgA", name: "core" });
    expect(calls[0].args[1]).toMatchObject({
      kind: "issue",
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
    const { provider, calls } = stubProvider();

    await acceptSubmission({
      id,
      provider,
      repo: "orgA/web",
      labels: ["bug", "backlog"],
      assignees: ["octocat"],
    });

    expect(calls[0].args[0]).toMatchObject({ owner: "orgA", name: "web" });
    expect(calls[0].args[1]).toMatchObject({
      labels: ["backlog", "bug"],
      assignees: ["octocat"],
    });
  });

  test("omits the source segment when none was given", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "No source", body: "hello" });
    const { provider, calls } = stubProvider();

    await acceptSubmission({ id, provider });

    expect((calls[0].args[1] as { body: string }).body).toBe(
      "hello\n\n_Submitted via Funnel intake_",
    );
  });

  test("rejects a repo outside the configured set and retains the row", async () => {
    const { id } = createSubmission({ title: "Bad repo" });
    const { provider, calls } = stubProvider();

    const result = await acceptSubmission({
      id,
      provider,
      repo: "evil/repo",
    });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(getSubmission(id)).toBeDefined();
  });

  test("requires a repo when no default is configured", async () => {
    const { id } = createSubmission({ title: "No target" });
    const { provider } = stubProvider();

    const result = await acceptSubmission({ id, provider });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(400);
    expect(getSubmission(id)).toBeDefined();
  });

  test("keeps the row when GitHub rejects the create", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "Upstream fails" });
    const { provider } = stubProvider(() => {
      throw Object.assign(new Error("Validation Failed"), { status: 422 });
    });

    const result = await acceptSubmission({ id, provider });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(422);
    expect(getSubmission(id)).toBeDefined();
  });

  test("maps a status-less upstream error to 502", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "Network blip" });
    const { provider } = stubProvider(() => {
      throw new Error("socket hang up");
    });

    const result = await acceptSubmission({ id, provider });

    expect(result).toEqual({ ok: false, status: 502, message: "socket hang up" });
    expect(getSubmission(id)).toBeDefined();
  });

  test("unknown submission is a 404", async () => {
    const { provider, calls } = stubProvider();
    const result = await acceptSubmission({ id: "nope", provider });
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
    const { provider, calls } = stubProvider();

    const result = await duplicateSubmission({
      id,
      provider,
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
    expect(calls[0].op).toBe("createComment");
    expect(calls[0].args[0]).toMatchObject({
      kind: "issue",
      number: "5",
      repo: { owner: "orgA", name: "core" },
    });
    expect(calls[0].args[1]).toBe(
      "**Crash on save**\n\nSteps to reproduce\n\n_Submitted via Funnel intake (source: email)_",
    );
    expect(getSubmission(id)).toBeUndefined();
  });

  test("rejects an unmirrored repo without a GitHub call", async () => {
    const { id } = createSubmission({ title: "Nowhere" });
    const { provider, calls } = stubProvider();

    const result = await duplicateSubmission({
      id,
      provider,
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
    const { provider, calls } = stubProvider();

    const result = await duplicateSubmission({
      id,
      provider,
      repo: "orgA/core",
      number: 999,
    });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  test("unknown submission is a 404", async () => {
    seedIssue();
    const { provider, calls } = stubProvider();
    const result = await duplicateSubmission({
      id: "nope",
      provider,
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
    const { provider } = stubProvider(() => {
      throw Object.assign(new Error("Resource not accessible"), { status: 403 });
    });

    const result = await duplicateSubmission({
      id,
      provider,
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
