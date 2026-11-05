import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import {
  authUser,
  stateIssueEvent,
  stateTriageEvent,
} from "#lib/server/db/schema";
import {
  upsertIssue,
  upsertRepo,
  type IssueRecord,
  type TimelineEventRecord,
  type UserRecord,
} from "#lib/server/sync/mirror";
import type { IssueEvent } from "#lib/server/actuals/time";
import { clearMirror } from "#tests/mirror-helpers";
import {
  listIssueHistory,
  localHistoryAction,
  localHistorySummary,
} from "./history";

const FORGE = "github";
const INSTANCE = "github.com";
const ORG = "orgA";
const NAME = "core";
const NUMBER = 1;

let repoId = 0;

function user(externalId: string, login: string): UserRecord {
  return {
    id: 0,
    externalId,
    forge: FORGE,
    instance: INSTANCE,
    login,
    avatarUrl: "",
    url: "",
  };
}

function seedIssue(events: TimelineEventRecord[] = []): IssueRecord {
  const issue: IssueRecord = {
    externalId: "101",
    kind: "issue",
    repoId,
    number: NUMBER,
    title: "Alpha",
    body: "",
    url: "https://github.com/orgA/core/issues/1",
    state: "open",
    stateReason: null,
    author: user("7", "octocat"),
    milestoneNumber: null,
    createdAt: 1,
    updatedAt: 2,
    closedAt: null,
    labels: ["todo"],
    assignees: [],
    comments: [],
    events,
  };
  upsertIssue(
    issue,
    {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      labelConflict: false,
    },
  );
  return issue;
}

function localEvent(
  id: string,
  kind: IssueEvent["kind"],
  fromValue: string | null,
  toValue: string | null,
  at: number,
): void {
  db.insert(stateIssueEvent)
    .values({
      id,
      org: ORG,
      name: NAME,
      issueNumber: NUMBER,
      kind,
      fromValue,
      toValue,
      at,
      source: "sync",
    })
    .run();
}

function mirrorEvent(
  id: string,
  kind: string,
  action: string,
  summary: string,
  occurredAt: number,
  detail: TimelineEventRecord["detail"] = null,
): TimelineEventRecord {
  return {
    externalId: id,
    kind,
    action,
    summary,
    actor: user("7", "octocat"),
    occurredAt,
    detail,
  };
}

function history() {
  return listIssueHistory({ repoId, org: ORG, name: NAME, number: NUMBER });
}

beforeEach(() => {
  clearMirror();
  db.delete(stateIssueEvent).run();
  db.delete(stateTriageEvent).run();
  db.delete(authUser).run();
  repoId = upsertRepo({
    externalId: "1",
    forge: FORGE,
    instance: INSTANCE,
    org: ORG,
    name: NAME,
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
});

describe("listIssueHistory", () => {
  test("merges local, intake and mirrored entries chronologically", () => {
    db.insert(authUser)
      .values({
        id: "u1",
        name: "triager",
        email: "triager@example.com",
        role: "write",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })
      .run();
    db.insert(stateTriageEvent)
      .values({
        id: "t1",
        submissionId: "s1",
        action: "accepted",
        actorUserId: "u1",
        repo: "orgA/core",
        number: NUMBER,
        reason: null,
        createdAt: 5,
      })
      .run();
    localEvent("e1", "status", "backlog", "todo", 10);
    seedIssue([
      mirrorEvent("m1", "referenced", "referenced", "referenced this issue", 20),
    ]);

    const items = history();
    expect(items.map((item) => item.id)).toEqual([
      "intake:t1",
      "funnel:e1",
      "github:1",
    ]);
    expect(items.map((item) => item.source)).toEqual([
      "funnel",
      "funnel",
      "github",
    ]);
    expect(items[0].summary).toBe("Created from intake");
    expect(items[0].actor).toMatchObject({
      login: "triager",
      forge: "funnel",
    });
    expect(items[1]).toMatchObject({
      kind: "status",
      action: "changed",
      summary: "Status changed from backlog to todo",
      actor: null,
    });
  });

  test("suppresses mirrored changes the local log already represents", () => {
    localEvent("l1", "label", null, "bug", 10);
    localEvent("l2", "label", "old", null, 11);
    localEvent("s1", "state", null, "closed", 12);
    localEvent("a1", "assignee", null, "alice", 13);
    seedIssue([
      mirrorEvent("m1", "label", "labelled", 'added label "bug"', 100, {
        label: "bug",
      }),
      mirrorEvent("m2", "label", "unlabelled", 'removed label "old"', 101, {
        label: "old",
      }),
      mirrorEvent("m3", "state_change", "closed", "closed this issue", 102),
      mirrorEvent("m4", "assignment", "assigned", "assigned @alice", 103, {
        assignee: "alice",
      }),
      mirrorEvent("m5", "referenced", "referenced", "referenced this issue", 104),
    ]);

    const items = history();
    expect(items.filter((item) => item.source === "github")).toHaveLength(1);
    expect(items.find((item) => item.source === "github")?.id).toBe("github:5");
  });

  test("does not duplicate comments and excludes comment kinds", () => {
    seedIssue([
      mirrorEvent("c1", "comment", "commented", "commented", 1),
      mirrorEvent("m1", "mention", "mentioned", "was mentioned", 2),
    ]);

    const items = history();
    expect(items.map((item) => item.id)).toEqual(["github:2"]);
  });

  test("returns an empty list when nothing happened yet", () => {
    seedIssue();
    expect(history()).toEqual([]);
  });

  test("guards a missing intake actor", () => {
    db.insert(stateTriageEvent)
      .values({
        id: "t2",
        submissionId: "s2",
        action: "accepted",
        actorUserId: "missing",
        repo: "orgA/core",
        number: NUMBER,
        createdAt: 5,
      })
      .run();
    seedIssue();

    expect(history()[0]).toMatchObject({
      summary: "Created from intake",
      actor: null,
    });
  });

  test("ignores an intake decision for a different issue", () => {
    db.insert(stateTriageEvent)
      .values({
        id: "t3",
        submissionId: "s3",
        action: "accepted",
        actorUserId: "u1",
        repo: "orgA/core",
        number: 99,
        createdAt: 5,
      })
      .run();
    seedIssue();

    expect(history()).toEqual([]);
  });
});

describe("local history wording", () => {
  function event(
    kind: IssueEvent["kind"],
    fromValue: string | null,
    toValue: string | null,
  ): IssueEvent {
    return { kind, fromValue, toValue, at: 1 };
  }

  test("status, state and blocked baselines and changes", () => {
    expect(localHistorySummary(event("status", null, "todo"))).toBe(
      "Status recorded as todo",
    );
    expect(localHistoryAction(event("status", "todo", "done"))).toBe("changed");
    expect(localHistorySummary(event("state", "open", "closed"))).toBe(
      "Closed this issue",
    );
    expect(localHistoryAction(event("state", "closed", "open"))).toBe(
      "reopened",
    );
    expect(localHistorySummary(event("state", "closed", "open"))).toBe(
      "Reopened this issue",
    );
    expect(localHistorySummary(event("state", null, "open"))).toBe(
      "State recorded as open",
    );
    expect(localHistorySummary(event("state", "open", "other"))).toBe(
      "State changed from open to other",
    );
    expect(localHistorySummary(event("blocked", null, "true"))).toBe(
      "Blocked this issue",
    );
    expect(localHistorySummary(event("blocked", "false", "true"))).toBe(
      "Marked this issue blocked",
    );
    expect(localHistorySummary(event("blocked", "true", "false"))).toBe(
      "Unblocked this issue",
    );
  });

  test("priority, label and assignee wording", () => {
    expect(localHistorySummary(event("priority", null, "P1"))).toBe(
      "Priority recorded as P1",
    );
    expect(localHistorySummary(event("priority", "P2", "P1"))).toBe(
      "Priority changed from P2 to P1",
    );
    expect(localHistorySummary(event("priority", "P1", null))).toBe(
      "Removed priority",
    );
    expect(localHistoryAction(event("priority", null, "P1"))).toBe("recorded");
    expect(localHistorySummary(event("label", null, "bug"))).toBe(
      'Added label "bug"',
    );
    expect(localHistorySummary(event("label", "bug", null))).toBe(
      'Removed label "bug"',
    );
    expect(localHistoryAction(event("label", null, "bug"))).toBe("added");
    expect(localHistoryAction(event("label", "bug", null))).toBe("removed");
    expect(localHistorySummary(event("assignee", null, "alice"))).toBe(
      "Assigned @alice",
    );
    expect(localHistorySummary(event("assignee", "alice", null))).toBe(
      "Unassigned @alice",
    );
    expect(localHistoryAction(event("assignee", null, "alice"))).toBe(
      "assigned",
    );
    expect(localHistoryAction(event("assignee", "alice", null))).toBe(
      "unassigned",
    );
  });
});
