import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import { stateIssueDelay, stateIssueEvent } from "#lib/server/db/schema";
import { clearMirror } from "#tests/mirror-helpers";
import { captureLog, type LogCapture } from "#tests/log-capture";
import { hydrateAndStore, type GraphqlFn } from "./hydrate";
import * as mirror from "./mirror";

let repoId = 0;
let logs: LogCapture;

function issueNode(timelineItems?: unknown) {
  return {
    databaseId: 101,
    number: 1,
    url: "https://github.com/orgA/core/issues/1",
    title: "Fix the thing",
    body: "",
    state: "OPEN",
    stateReason: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    closedAt: null,
    author: { databaseId: 7, login: "octocat", avatarUrl: "" },
    milestone: null,
    labels: { nodes: [] },
    assignees: { nodes: [] },
    ...(timelineItems === undefined ? {} : { timelineItems }),
  };
}

function labeledEvent(id: string, name: string) {
  return {
    __typename: "LabeledEvent",
    id,
    createdAt: "2026-01-02T00:00:00Z",
    actor: { databaseId: 7, login: "octocat", avatarUrl: "" },
    label: { name },
  };
}

beforeEach(() => {
  clearMirror();
  db.delete(stateIssueEvent).run();
  db.delete(stateIssueDelay).run();
  logs = captureLog();
  repoId = mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
});

afterEach(() => {
  logs.reset();
});

describe("timeline hydration", () => {
  test("passes the window and persists normalized events", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const graphql: GraphqlFn = async (_query, variables) => {
      calls.push(variables ?? {});
      return {
        nodes: [
          issueNode({
            nodes: [labeledEvent("e1", "bug"), labeledEvent("e2", "todo")],
          }),
        ],
      };
    };

    const since = "2026-01-15T00:00:00.000Z";
    await hydrateAndStore(1, repoId, ["n1"], graphql, { since });

    expect(calls[0]).toMatchObject({ ids: ["n1"], since });
    const events = mirror.getIssueTimelineEvents(repoId, 1);
    expect(events.map((event) => event.summary)).toEqual([
      'added label "bug"',
      'added label "todo"',
    ]);
    expect(events[0].actor?.login).toBe("octocat");
  });

  test("upserts events idempotently across hydration passes", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        issueNode({
          nodes: [labeledEvent("e1", "bug")],
        }),
      ],
    });

    await hydrateAndStore(1, repoId, ["n1"], graphql);
    await hydrateAndStore(1, repoId, ["n1"], graphql);

    expect(mirror.getIssueTimelineEvents(repoId, 1)).toHaveLength(1);
  });

  test("a timeline failure does not block the issue upsert", async () => {
    const node = issueNode();
    Object.defineProperty(node, "timelineItems", {
      enumerable: true,
      get() {
        throw new Error("timeline unavailable");
      },
    });
    const graphql: GraphqlFn = async () => ({ nodes: [node] });

    const records = await hydrateAndStore(1, repoId, ["n1"], graphql);

    expect(records).toHaveLength(1);
    expect(mirror.getIssue(repoId, 1)?.title).toBe("Fix the thing");
    expect(mirror.getIssueTimelineEvents(repoId, 1)).toEqual([]);
    expect(logs.find("sync", "timeline normalization failed")).toBeDefined();
  });

  test("a failed hydration query still rejects", async () => {
    const graphql: GraphqlFn = async () => {
      throw new Error("graphql down");
    };

    await expect(hydrateAndStore(1, repoId, ["n1"], graphql)).rejects.toThrow(
      /graphql down/,
    );
  });

  test("deleting the issue removes its timeline events", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        issueNode({
          nodes: [labeledEvent("e1", "bug")],
        }),
      ],
    });
    await hydrateAndStore(1, repoId, ["n1"], graphql);
    expect(mirror.getIssueTimelineEvents(repoId, 1)).toHaveLength(1);

    mirror.deleteIssue(repoId, 1);

    expect(mirror.getIssueTimelineEvents(repoId, 1)).toEqual([]);
  });
});
