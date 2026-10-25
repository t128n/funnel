/**
 * `/epics` and its detail page (SPEC §5, §6).
 *
 * The list and detail loads are exercised against the shared in-memory mirror,
 * and the browser contracts (request bodies, sidebar active state, read-only
 * controls) are checked with the source-read style used by the planner tests.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { db } from "#lib/server/db/index";
import { stateIssueDelay, stateIssueEvent } from "#lib/server/db/schema";
import { deriveMetadata } from "#lib/server/sync/conflicts";
import {
  upsertIssue,
  upsertRepo,
  type StoredMetadata,
} from "#lib/server/sync/mirror";
import { setConfig } from "#lib/server/config";
import { writeEpicChildren } from "#lib/funnel-metadata";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import {
  addChild,
  addChildRequest,
  epicChildrenRequest,
  removeChild,
  removeChildRequest,
} from "#lib/components/epics/epic-actions";
import { load as loadDetail } from "#/routes/(app)/epics/[owner]/[repo]/[number]/+page.server";
import { load as loadList } from "#/routes/(app)/epics/+page.server";

const START = Date.parse("2026-10-01T00:00:00Z");
const HOUR = 60 * 60_000;

function source(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
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

function activeInterval(
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

function delay(
  org: string,
  name: string,
  number: number,
  start: number,
  end: number,
): void {
  db.insert(stateIssueDelay)
    .values({
      id: `delay-${org}-${name}-${number}`,
      org,
      name,
      issueNumber: number,
      reason: "review",
      startedAt: start,
      endedAt: end,
      note: "",
      source: "manual",
    })
    .run();
}

beforeEach(() => {
  clearMirror();
  db.delete(stateIssueEvent).run();
  db.delete(stateIssueDelay).run();
  setConfig({ ...TEST_CONFIG });
});

afterEach(() => {
  clearMirror();
  db.delete(stateIssueEvent).run();
  db.delete(stateIssueDelay).run();
});

describe("epics list", () => {
  test("test_epics_list_open_first", async () => {
    const core = repo("epicpage", "core", "list-1");
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

    const data = await loadList({} as never);
    expect(data.epics.map((epic) => epic.state)).toEqual(["open", "closed"]);
    expect(data.epics[0].ref).toBe("epicpage/core#20");

    // Both pages label the collection, even when it is empty.
    expect(source("src/routes/(app)/epics/+page.svelte")).toContain("<h1");
  });

  test("test_epics_list_rollups", async () => {
    const core = repo("epicpage", "core", "list-2");
    issue({
      repoId: core,
      number: 1,
      title: "Epic",
      labels: ["epic"],
      body: writeEpicChildren("", ["epicpage/core#10", "epicpage/core#11"]),
    });
    issue({
      repoId: core,
      number: 10,
      title: "Done child",
      labels: ["sm"],
      state: "closed",
      closedAt: START + HOUR,
    });
    issue({ repoId: core, number: 11, title: "Open child", labels: ["md"] });
    activeInterval("epicpage", "core", 10, START, START + HOUR);
    delay("epicpage", "core", 10, START, START + 30 * 60_000);

    const data = await loadList({} as never);
    expect(data.epics[0]).toMatchObject({
      childCount: 2,
      closedChildCount: 1,
      progress: 0.5,
      estimateMinutes: 360,
      actualMinutes: 60,
      delayMinutes: 30,
    });

    const list = source("src/lib/components/epics/EpicList.svelte");
    expect(list).toContain("formatMinutes");
    expect(list).toContain("barPercent");
    expect(list).toContain("epic.estimateMinutes");
    expect(list).toContain("epic.actualMinutes");
    expect(list).toContain("epic.delayMinutes");
  });
});

describe("epic detail", () => {
  test("test_epic_detail_children", async () => {
    const core = repo("epicpage", "core", "detail-1");
    const web = repo("epicpage", "web", "detail-2");
    issue({
      repoId: core,
      number: 1,
      title: "Release train",
      labels: ["epic"],
      body: writeEpicChildren("", ["epicpage/core#10", "epicpage/web#3"]),
    });
    issue({ repoId: core, number: 10, title: "Core child", labels: ["sm"] });
    issue({ repoId: web, number: 3, title: "Web child", labels: ["md"] });
    issue({ repoId: core, number: 30, title: "Open candidate", labels: ["sm"] });
    issue({
      repoId: core,
      number: 31,
      title: "Other child",
      labels: [],
    });
    issue({
      repoId: core,
      number: 32,
      title: "Other epic",
      labels: ["epic"],
      body: writeEpicChildren("", ["epicpage/core#31"]),
    });

    const data = await loadDetail({
      params: { owner: "epicpage", repo: "core", number: "1" },
    } as never);

    expect(data.epic.children.map((child) => child.ref)).toEqual([
      "epicpage/core#10",
      "epicpage/web#3",
    ]);
    expect(data.epic.children.map((child) => child.title)).toEqual([
      "Core child",
      "Web child",
    ]);
    expect(data.epic.estimateMinutes).toBe(360);
    expect(data.epic.childCount).toBe(2);

    // Candidates are open issues that no epic claims and that are not epics.
    expect(data.candidates.map((candidate) => candidate.ref)).toEqual([
      "epicpage/core#30",
    ]);

    const page = source(
      "src/routes/(app)/epics/[owner]/[repo]/[number]/+page.svelte",
    );
    expect(page).toContain("<EpicRollups");
    expect(page).toContain("<EpicChildTable");
  });

  test("test_unavailable_child_stays_in_list", async () => {
    const core = repo("epicpage", "core", "detail-3");
    issue({
      repoId: core,
      number: 1,
      title: "Epic",
      labels: ["epic"],
      body: writeEpicChildren("", ["epicpage/core#10", "epicpage/core#99"]),
    });
    issue({ repoId: core, number: 10, title: "Mirrored child", labels: ["sm"] });

    const data = await loadDetail({
      params: { owner: "epicpage", repo: "core", number: "1" },
    } as never);

    // The unmirrored ref is kept in written order and excluded from rollups.
    expect(data.epic.children.map((child) => child.ref)).toEqual([
      "epicpage/core#10",
      "epicpage/core#99",
    ]);
    expect(data.epic.children[1].available).toBe(false);
    expect(data.epic.childCount).toBe(1);

    // Removing the mirrored child still sends the unavailable ref, so a body
    // rewrite never silently drops a ref the reader cannot resolve.
    const refs = data.epic.children.map((child) => child.ref);
    const request = removeChildRequest(
      data.epic.repo,
      data.epic.number,
      refs,
      "epicpage/core#10",
    );
    expect(JSON.parse(request.body)).toEqual({
      children: ["epicpage/core#99"],
    });
  });

  test("test_epic_detail_missing_returns_404", async () => {
    const core = repo("epicpage", "core", "detail-4");
    issue({ repoId: core, number: 5, title: "Plain issue", labels: [] });

    await expect(
      loadDetail({
        params: { owner: "epicpage", repo: "core", number: "5" },
      } as never),
    ).rejects.toThrow();
    await expect(
      loadDetail({
        params: { owner: "epicpage", repo: "core", number: "nope" },
      } as never),
    ).rejects.toThrow();
  });
});

describe("epic child mutations", () => {
  test("test_add_child_replaces_list", () => {
    expect(addChild(["epicpage/core#10"], "epicpage/web#3")).toEqual([
      "epicpage/core#10",
      "epicpage/web#3",
    ]);
    // Duplicates are ignored rather than sent twice.
    expect(addChild(["epicpage/core#10"], "epicpage/core#10")).toEqual([
      "epicpage/core#10",
    ]);

    const request = addChildRequest(
      "epicpage/core",
      1,
      ["epicpage/core#10"],
      "epicpage/web#3",
    );
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(
      "/api/repos/epicpage/core/issues/1/epic/children",
    );
    expect(JSON.parse(request.body)).toEqual({
      children: ["epicpage/core#10", "epicpage/web#3"],
    });

    // The dialog must take the tested path, so dedupe and the full-list body
    // cannot drift from the helper the unit test exercises.
    const dialog = source("src/lib/components/epics/AddChildDialog.svelte");
    expect(dialog).toContain("addChildRequest(");
    expect(dialog).not.toContain("[...children, selected.ref]");
  });

  test("test_remove_child", () => {
    expect(
      removeChild(
        ["epicpage/core#10", "epicpage/web#3"],
        "epicpage/core#10",
      ),
    ).toEqual(["epicpage/web#3"]);

    const request = removeChildRequest(
      "epicpage/core",
      1,
      ["epicpage/core#10", "epicpage/web#3"],
      "epicpage/core#10",
    );
    expect(request.method).toBe("PUT");
    expect(JSON.parse(request.body)).toEqual({
      children: ["epicpage/web#3"],
    });
    // The replacement request is the same endpoint as adding.
    expect(request.url).toBe(
      epicChildrenRequest("epicpage/core", 1, []).url,
    );
  });
});

describe("epics navigation and access", () => {
  test("test_sidebar_epics_active", () => {
    const sidebar = source("src/lib/components/app-sidebar.svelte");
    expect(sidebar).toContain('label: "Epics"');
    expect(sidebar).toContain('{ href: "/epics", label: "Epics"');
    expect(sidebar).toContain(
      'const epicsActive = $derived(path.startsWith("/epics"));',
    );
    expect(sidebar).toContain("active: epicsActive");
    // The item belongs to the Workspace section, not the personal block.
    const workspace = sidebar.slice(sidebar.indexOf("const workspace"));
    expect(workspace).toContain('label: "Epics"');
  });

  test("test_read_only_hides_edit", () => {
    const page = source(
      "src/routes/(app)/epics/[owner]/[repo]/[number]/+page.svelte",
    );
    expect(page).toContain("canWrite(data.user?.role)");
    expect(page).toContain("{#if mayWrite}");
    expect(page).toContain("<AddChildDialog");
    // The add dialog and per-child remove control both sit behind `mayWrite`.
    const guarded = page.slice(page.indexOf("{#if mayWrite}"));
    expect(guarded).toContain("<AddChildDialog");
    expect(guarded).toContain("onremove");
    expect(page).not.toContain("<AddChildDialog\n\t\topen={dialogOpen}\n\t\tcandidates");
  });
});
