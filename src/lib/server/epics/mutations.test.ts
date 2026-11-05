import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import type { GitHubProvider } from "#lib/server/forge/providers.server";
import {
  readBlocked,
  readEpicChildren,
  writeBlocked,
  writeEpicChildren,
} from "#lib/funnel-metadata";
import { resetEventBus, subscribe, type SyncEvent } from "#lib/server/sync/events";
import { deriveMetadata } from "#lib/server/sync/conflicts";
import {
  upsertIssue,
  upsertRepo,
  type StoredMetadata,
} from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { setEpicChildren, setEpicLabel } from "./mutations";

interface Call {
  op: string;
  args: unknown[];
}

function metadata(labels: string[]): StoredMetadata {
  const derived = deriveMetadata(labels);
  return {
    status: derived.status,
    impact: derived.impact,
    urgency: derived.urgency,
    priority: derived.priority,
    size: derived.size,
    blocked: derived.blocked,
    isEpic: derived.isEpic,
    labelConflict: false,
  };
}

function stubProvider(options: {
  body?: string;
  labels?: string[];
  fail?: { op: string; error: Error };
} = {}): { provider: GitHubProvider; calls: Call[] } {
  const calls: Call[] = [];
  const fail = (op: string) => {
    if (options.fail?.op === op) throw options.fail.error;
  };
  const thread = (ref: unknown) => ({
    ref,
    kind: "issue",
    title: "Epic",
    body: options.body ?? "",
    state: "open",
    stateReason: null,
    labels: (options.labels ?? []).map((name) => ({ name })),
    assignees: [],
    reviewers: [],
    isDraft: false,
    url: "https://github.com/orgA/core/issues/1",
    raw: {},
  });

  const provider = {
    threads: {
      get: async (ref: unknown) => {
        calls.push({ op: "get", args: [ref] });
        fail("get");
        return thread(ref);
      },
      update: async (ref: unknown, input: unknown) => {
        calls.push({ op: "update", args: [ref, input] });
        fail("update");
        return thread(ref);
      },
      setLabels: async (ref: unknown, names: string[]) => {
        calls.push({ op: "setLabels", args: [ref, names] });
        fail("setLabels");
        return names.map((name) => ({ name }));
      },
      removeLabels: async (ref: unknown, names: string[]) => {
        calls.push({ op: "removeLabels", args: [ref, names] });
        fail("removeLabels");
        return [];
      },
      close: async (ref: unknown) => {
        calls.push({ op: "close", args: [ref] });
        return thread(ref);
      },
    },
  };

  return { provider: provider as unknown as GitHubProvider, calls };
}

function seedRepo(): number {
  return upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
}

function seedIssue(
  repoId: number,
  number: number,
  labels: string[],
  body = "",
): void {
  upsertIssue(
    {
      externalId: `ext-${number}`,
      repoId,
      number,
      kind: "issue",
      title: `issue ${number}`,
      body,
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "",
      createdAt: 1,
      updatedAt: 1,
      closedAt: null,
      labels,
      assignees: [],
      comments: [],
    },
    metadata(labels),
  );
}

beforeEach(() => {
  clearMirror();
  resetEventBus();
  setConfig({
    ...TEST_CONFIG,
    repos: [
      { repo: "orgA/core", shortcode: "CORE" },
      { repo: "orgA/web", shortcode: "WEB" },
    ],
  });
});

describe("setEpicLabel", () => {
  test("test_set_epic_label_toggles", async () => {
    const add = stubProvider({ labels: [] });
    const added = await setEpicLabel({
      provider: add.provider,
      repo: "orgA/core",
      number: 1,
      isEpic: true,
    });
    expect(added).toEqual({ ok: true, value: { isEpic: true } });
    expect(add.calls.at(-1)).toEqual({
      op: "setLabels",
      args: [expect.anything(), ["epic"]],
    });

    const remove = stubProvider({ labels: ["epic"] });
    const removed = await setEpicLabel({
      provider: remove.provider,
      repo: "orgA/core",
      number: 1,
      isEpic: false,
    });
    expect(removed).toEqual({ ok: true, value: { isEpic: false } });
    expect(remove.calls.at(-1)).toEqual({
      op: "removeLabels",
      args: [expect.anything(), ["epic"]],
    });
  });

  test("uses the configured epic name for add and remove", async () => {
    setConfig({
      ...TEST_CONFIG,
      labels: { prefix: "funnel" },
      repos: [
        { repo: "orgA/core", shortcode: "CORE" },
        { repo: "orgA/web", shortcode: "WEB" },
      ],
    });

    // An old unprefixed epic label stays as an ordinary label; the configured
    // name is what gets added.
    const add = stubProvider({ labels: ["epic"] });
    const added = await setEpicLabel({
      provider: add.provider,
      repo: "orgA/core",
      number: 1,
      isEpic: true,
    });
    expect(added).toEqual({ ok: true, value: { isEpic: true } });
    expect(add.calls.at(-1)).toEqual({
      op: "setLabels",
      args: [expect.anything(), ["epic", "funnel-epic"]],
    });

    const remove = stubProvider({ labels: ["funnel-epic"] });
    const removed = await setEpicLabel({
      provider: remove.provider,
      repo: "orgA/core",
      number: 1,
      isEpic: false,
    });
    expect(removed).toEqual({ ok: true, value: { isEpic: false } });
    expect(remove.calls.at(-1)).toEqual({
      op: "removeLabels",
      args: [expect.anything(), ["funnel-epic"]],
    });
  });
});

describe("setEpicChildren", () => {
  test("test_set_children_writes_body", async () => {
    const repoId = seedRepo();
    const blocked = writeBlocked("Intro", {
      blocker: "waiting",
      needs: "API",
      trying: "",
      recheck: "",
      reason: "dependency",
    });
    seedIssue(repoId, 1, ["epic"], blocked);
    seedIssue(repoId, 2, []);

    const stub = stubProvider({ body: blocked, labels: ["epic"] });
    const seen: SyncEvent[] = [];
    const unsubscribe = subscribe((event) => seen.push(event));

    const result = await setEpicChildren({
      provider: stub.provider,
      repo: "orgA/core",
      number: 1,
      children: ["orgA/core#2"],
    });
    unsubscribe();

    expect(result).toEqual({ ok: true, value: { children: ["orgA/core#2"] } });
    const update = stub.calls.find((call) => call.op === "update");
    const body = (update!.args[1] as { body: string }).body;
    expect(readEpicChildren(body)).toEqual(["orgA/core#2"]);
    expect(readBlocked(body).info).toMatchObject({
      blocker: "waiting",
      needs: "API",
      reason: "dependency",
    });
    expect(seen).toContainEqual({
      type: "issues",
      repo: "orgA/core",
      numbers: [1],
    });
  });

  test("test_duplicate_child_rejected", async () => {
    const repoId = seedRepo();
    seedIssue(
      repoId,
      1,
      ["epic"],
      writeEpicChildren("", ["orgA/core#2"]),
    );
    seedIssue(repoId, 2, []);
    seedIssue(repoId, 3, ["epic"]);

    const stub = stubProvider({ body: "", labels: ["epic"] });
    const result = await setEpicChildren({
      provider: stub.provider,
      repo: "orgA/core",
      number: 3,
      children: ["orgA/core#2"],
    });

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(stub.calls).toHaveLength(0);
  });

  test("test_nested_epic_rejected", async () => {
    const repoId = seedRepo();
    seedIssue(repoId, 1, ["epic"]);
    seedIssue(repoId, 2, ["epic"]);

    const stub = stubProvider({ body: "", labels: ["epic"] });
    const result = await setEpicChildren({
      provider: stub.provider,
      repo: "orgA/core",
      number: 1,
      children: ["orgA/core#2"],
    });

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(stub.calls).toHaveLength(0);
  });

  test("rejects a self reference", async () => {
    const repoId = seedRepo();
    seedIssue(repoId, 1, ["epic"]);

    const stub = stubProvider({ labels: ["epic"] });
    const result = await setEpicChildren({
      provider: stub.provider,
      repo: "orgA/core",
      number: 1,
      children: ["orgA/core#1"],
    });

    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});
