import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIssueDelay, stateIssueEvent } from "#lib/server/db/schema";
import { deriveMetadata } from "#lib/server/sync/conflicts";
import {
  upsertIssue,
  upsertRepo,
  type StoredMetadata,
} from "#lib/server/sync/mirror";
import { writeEpicChildren } from "#lib/funnel-metadata";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { getEpicDetail, listEpics } from "./queries";

const START = Date.parse("2026-10-01T00:00:00Z");
const HOUR = 60 * 60_000;

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

function repo(org: string, name: string, externalId: string): number {
  return upsertRepo({
    externalId,
    forge: "github",
    instance: "github.com",
    org,
    name,
    url: `https://github.com/${org}/${name}`,
    archived: false,
  }).id;
}

function issue(input: {
  repoId: number;
  number: number;
  title: string;
  body?: string;
  labels?: string[];
  state?: "open" | "closed";
  closedAt?: number | null;
  updatedAt?: number;
}): void {
  const labels = input.labels ?? [];
  upsertIssue(
    {
      externalId: `ext-${input.repoId}-${input.number}`,
      repoId: input.repoId,
      number: input.number,
      kind: "issue",
      title: input.title,
      body: input.body ?? "",
      state: input.state ?? "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "",
      createdAt: START,
      updatedAt: input.updatedAt ?? START,
      closedAt: input.closedAt ?? null,
      labels,
      assignees: [],
      comments: [],
    },
    metadata(labels),
  );
}

function markActive(
  org: string,
  name: string,
  number: number,
  start: number,
  end: number,
): void {
  db.insert(stateIssueEvent)
    .values([
      {
        id: `start-${org}-${name}-${number}`,
        org,
        name,
        issueNumber: number,
        kind: "status",
        fromValue: null,
        toValue: "in-progress",
        at: start,
        source: "test",
      },
      {
        id: `close-${org}-${name}-${number}`,
        org,
        name,
        issueNumber: number,
        kind: "state",
        fromValue: "open",
        toValue: "closed",
        at: end,
        source: "test",
      },
    ])
    .run();
}

beforeEach(() => {
  clearMirror();
  db.delete(stateIssueEvent).run();
  db.delete(stateIssueDelay).run();
  setConfig({ ...TEST_CONFIG });
});

describe("listEpics", () => {
  test("test_list_epics_open_before_closed", async () => {
    const core = repo("epicqa", "core", "1");
    issue({
      repoId: core,
      number: 20,
      title: "Open epic",
      labels: ["epic"],
      updatedAt: START,
    });
    issue({
      repoId: core,
      number: 21,
      title: "Closed epic",
      labels: ["epic"],
      state: "closed",
      closedAt: START + HOUR,
      updatedAt: START + 2 * HOUR,
    });

    const epics = await listEpics();
    expect(epics.map((epic) => epic.state)).toEqual(["open", "closed"]);
    expect(epics[0].ref).toBe("epicqa/core#20");
  });

  test("test_progress_and_rollups", async () => {
    const core = repo("epicqa", "core", "1");
    issue({
      repoId: core,
      number: 1,
      title: "Epic",
      labels: ["epic"],
      body: writeEpicChildren("", ["epicqa/core#10", "epicqa/core#11"]),
    });
    issue({
      repoId: core,
      number: 10,
      title: "Done child",
      labels: ["sm"],
      state: "closed",
      closedAt: START + HOUR,
    });
    issue({
      repoId: core,
      number: 11,
      title: "Open child",
      labels: ["md"],
    });
    markActive("epicqa", "core", 10, START, START + HOUR);

    const [epic] = await listEpics();
    expect(epic.childCount).toBe(2);
    expect(epic.closedChildCount).toBe(1);
    expect(epic.progress).toBe(0.5);
    expect(epic.estimateMinutes).toBe(360);
    expect(epic.actualMinutes).toBe(60);
  });

  test("test_missing_child_skipped", async () => {
    const core = repo("epicqa", "core", "1");
    issue({
      repoId: core,
      number: 1,
      title: "Epic",
      labels: ["epic"],
      body: writeEpicChildren("", ["epicqa/core#10", "epicqa/core#999"]),
    });
    issue({ repoId: core, number: 10, title: "Child", labels: [] });

    const [epic] = await listEpics();
    expect(epic.childCount).toBe(1);
    expect(epic.progress).toBe(0);

    const detail = await getEpicDetail("epicqa/core#1");
    expect(detail?.children).toHaveLength(2);
    expect(detail?.children[1]).toMatchObject({
      ref: "epicqa/core#999",
      available: false,
    });
    expect(detail?.childCount).toBe(1);
  });
});
