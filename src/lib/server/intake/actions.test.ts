import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  stateIntakeSubmission,
  stateTriageEvent,
} from "#lib/server/db/schema";
import type { GitHubProvider } from "#lib/server/forge/providers.server";
import { resetEventBus, subscribe } from "#lib/server/sync/events";
import { upsertIssue, upsertRepo } from "#lib/server/sync/mirror";
import { listTriageEvents } from "./events";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import {
  acceptSubmission,
  dismissSubmission,
  duplicateSubmission,
  undoTriageEvent,
} from "./actions";
import { createSubmission, getSubmission } from "./staging";

const ACTOR = "triager";

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
  const repo = upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  });
  upsertIssue(
    {
      externalId: "100",
      repoId: repo.id,
      number: 5,
      kind: "issue",
      title: "Existing issue",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "https://github.com/orgA/core/issues/5",
      createdAt: 1,
      updatedAt: 1,
      closedAt: null,
      labels: [],
      assignees: [],
      comments: [],
    },
    { status: "todo", impact: null, urgency: null, priority: null, size: null, blocked: false, labelConflict: false },
  );
}

beforeEach(() => {
  db.delete(stateTriageEvent).run();
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

    const result = await acceptSubmission({ id, actorUserId: ACTOR, provider });

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
    expect(getSubmission(id)?.archivedAt).toBeNumber();
    expect(listTriageEvents(id)).toEqual([
      expect.objectContaining({
        action: "accepted",
        actorUserId: ACTOR,
        repo: "orgA/core",
        number: 42,
      }),
    ]);
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
      actorUserId: ACTOR,
      provider,
      repo: "orgA/web",
      status: "todo",
      labels: ["bug"],
      assignees: ["octocat"],
    });

    expect(calls[0].args[0]).toMatchObject({ owner: "orgA", name: "web" });
    expect(calls[0].args[1]).toMatchObject({
      labels: ["todo", "bug"],
      assignees: ["octocat"],
    });
  });

  test("rejects an unknown status without a GitHub call", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "Bad status" });
    const { provider, calls } = stubProvider();

    const result = await acceptSubmission({
      id,
      actorUserId: ACTOR,
      provider,
      status: "not-a-status",
    });

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
    expect(getSubmission(id)?.archivedAt).toBeNull();
  });

  test("omits the source segment when none was given", async () => {
    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "No source", body: "hello" });
    const { provider, calls } = stubProvider();

    await acceptSubmission({ id, actorUserId: ACTOR, provider });

    expect((calls[0].args[1] as { body: string }).body).toBe(
      "hello\n\n_Submitted via Funnel intake_",
    );
  });

  test("rejects a repo outside the configured set and retains the row", async () => {
    const { id } = createSubmission({ title: "Bad repo" });
    const { provider, calls } = stubProvider();

    const result = await acceptSubmission({
      id,
      actorUserId: ACTOR,
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

    const result = await acceptSubmission({ id, actorUserId: ACTOR, provider });

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

    const result = await acceptSubmission({ id, actorUserId: ACTOR, provider });

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

    const result = await acceptSubmission({ id, actorUserId: ACTOR, provider });

    expect(result).toEqual({ ok: false, status: 502, message: "socket hang up" });
    expect(getSubmission(id)).toBeDefined();
  });

  test("unknown submission is a 404", async () => {
    const { provider, calls } = stubProvider();
    const result = await acceptSubmission({
      id: "nope",
      actorUserId: ACTOR,
      provider,
    });
    expect(result).toEqual({
      ok: false,
      status: 404,
      message: "Submission not found",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("dismissSubmission", () => {
  test("archives with the reason and appends a dismissed event", () => {
    const { id } = createSubmission({ title: "Drop" });
    const result = dismissSubmission({
      id,
      actorUserId: ACTOR,
      reason: "  duplicate report  ",
    });

    expect(result.ok).toBe(true);
    const eventId = (result as { value: { eventId: string } }).value.eventId;
    expect(eventId).toBeString();

    const archived = getSubmission(id);
    expect(archived?.archivedAt).toBeNumber();
    expect(archived?.dismissReason).toBe("duplicate report");
    expect(listTriageEvents(id)).toEqual([
      expect.objectContaining({
        id: eventId,
        submissionId: id,
        action: "dismissed",
        actorUserId: ACTOR,
        reason: "duplicate report",
      }),
    ]);
  });

  test("requires a non-blank reason and keeps the row pending", () => {
    const { id } = createSubmission({ title: "Keep" });
    expect(
      dismissSubmission({ id, actorUserId: ACTOR, reason: "   " }),
    ).toEqual({
      ok: false,
      status: 400,
      message: "A dismissal reason is required",
    });
    expect(getSubmission(id)?.archivedAt).toBeNull();
    expect(listTriageEvents(id)).toEqual([]);
  });

  test("rejects a reason over 500 characters", () => {
    const { id } = createSubmission({ title: "Long reason" });
    const result = dismissSubmission({
      id,
      actorUserId: ACTOR,
      reason: "x".repeat(501),
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(getSubmission(id)?.archivedAt).toBeNull();
  });

  test("unknown submission is a 404", () => {
    expect(
      dismissSubmission({ id: "nope", actorUserId: ACTOR, reason: "gone" }),
    ).toEqual({
      ok: false,
      status: 404,
      message: "Submission not found",
    });
  });
});

describe("undoTriageEvent", () => {
  test("appends an undone event and restores the submission", () => {
    const { id } = createSubmission({ title: "Bring back" });
    const dismissed = dismissSubmission({
      id,
      actorUserId: ACTOR,
      reason: "not a duplicate",
    });
    const eventId = (dismissed as { value: { eventId: string } }).value.eventId;

    expect(undoTriageEvent(eventId, "lead")).toEqual({
      ok: true,
      value: { id },
    });
    expect(getSubmission(id)?.archivedAt).toBeNull();
    expect(getSubmission(id)?.dismissReason).toBeNull();

    const events = listTriageEvents(id);
    expect(events.map((event) => event.action)).toEqual([
      "dismissed",
      "undone",
    ]);
    expect(events[1]).toMatchObject({
      actorUserId: "lead",
      reason: "not a duplicate",
    });
    // The original event is retained untouched.
    expect(events[0].reason).toBe("not a duplicate");
    expect(events[0].actorUserId).toBe(ACTOR);
  });

  test("only the latest dismissal can be undone", () => {
    const { id } = createSubmission({ title: "Twice" });
    const first = dismissSubmission({
      id,
      actorUserId: ACTOR,
      reason: "first",
    });
    const firstEvent = (first as { value: { eventId: string } }).value.eventId;
    undoTriageEvent(firstEvent, ACTOR);
    const second = dismissSubmission({
      id,
      actorUserId: ACTOR,
      reason: "second",
    });
    const secondEvent = (second as { value: { eventId: string } }).value.eventId;

    expect(
      undoTriageEvent(firstEvent, ACTOR),
    ).toMatchObject({ ok: false, status: 409 });
    expect(undoTriageEvent(secondEvent, ACTOR).ok).toBe(true);
  });

  test("rejects unknown events and non-dismiss events", () => {
    expect(undoTriageEvent("nope", ACTOR)).toEqual({
      ok: false,
      status: 404,
      message: "Triage event not found",
    });

    setConfig({ ...TEST_CONFIG, intake: { default_repo: "orgA/core" } });
    const { id } = createSubmission({ title: "Accepted" });
    const { provider } = stubProvider();
    return acceptSubmission({ id, actorUserId: ACTOR, provider }).then(() => {
      const accepted = listTriageEvents(id)[0];
      expect(
        undoTriageEvent(accepted.id, ACTOR),
      ).toEqual({
        ok: false,
        status: 400,
        message: "Only a dismissed submission can be undone",
      });
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
      actorUserId: ACTOR,
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
    const archived = getSubmission(id);
    expect(archived?.archivedAt).toBeNumber();
    expect(archived?.duplicateRepo).toBe("orgA/core");
    expect(archived?.duplicateNumber).toBe(5);
    expect(listTriageEvents(id)).toEqual([
      expect.objectContaining({
        action: "duplicated",
        actorUserId: ACTOR,
        repo: "orgA/core",
        number: 5,
      }),
    ]);
  });

  test("rejects an unmirrored repo without a GitHub call", async () => {
    const { id } = createSubmission({ title: "Nowhere" });
    const { provider, calls } = stubProvider();

    const result = await duplicateSubmission({
      id,
      actorUserId: ACTOR,
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
      actorUserId: ACTOR,
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
      actorUserId: ACTOR,
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
      actorUserId: ACTOR,
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
