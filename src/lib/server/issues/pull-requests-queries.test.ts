import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import * as mirror from "#lib/server/sync/mirror";
import {
  getIssueDetail,
  getIssueListItem,
  summarizePullRequests,
} from "./queries";

let repo: mirror.RepoRow;

function seedIssue(number: number): void {
  mirror.upsertIssue(
    {
      externalId: `I_${number}`,
      repoId: repo.id,
      number,
      kind: "issue",
      title: "With a pull request",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "",
      createdAt: 1,
      updatedAt: 2,
      closedAt: null,
      labels: ["todo"],
      assignees: [],
      comments: [],
    },
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
}

function seedPullRequest(number: number, state: string): void {
  mirror.upsertPullRequests([
    {
      repoId: repo.id,
      number,
      externalId: `PR_${number}`,
      title: `PR ${number}`,
      state: state as "open" | "closed" | "merged" | "unknown",
      isDraft: false,
      merged: state === "merged",
      reviewDecision: "approved",
      approvedCount: 1,
      changesRequestedCount: 0,
      pendingReviewCount: 0,
      checks:
        state === "open"
          ? { state: "failure", total: 3, failed: 1, url: null }
          : null,
      url: `https://github.com/orgA/core/pull/${number}`,
      author: null,
      createdAt: 1,
      updatedAt: 2,
      closedAt: null,
      mergedAt: state === "merged" ? 3 : null,
    },
  ]);
}

beforeEach(() => {
  clearMirror();
  setConfig(TEST_CONFIG);
  repo = mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "",
    archived: false,
  });
});

describe("pull request summaries", () => {
  test("a failure dominates pending and success", () => {
    expect(
      summarizePullRequests([
        { state: "open", checksState: "success", checksFailed: 0 },
        { state: "open", checksState: "failure", checksFailed: 2 },
        { state: "merged", checksState: "pending", checksFailed: 0 },
      ]),
    ).toEqual({
      total: 3,
      open: 2,
      merged: 1,
      closed: 0,
      checksState: "failure",
      checksFailed: 2,
    });
  });

  test("no rows means no indicator payload", () => {
    expect(summarizePullRequests([])).toBeUndefined();
  });
});

describe("list and detail payloads", () => {
  test("list rows carry a compact indicator and detail carries the panel", () => {
    seedIssue(1);
    seedPullRequest(10, "open");
    seedPullRequest(11, "merged");
    mirror.replaceIssuePullRequestLinks(repo.id, 1, [
      { prNumber: 10, source: "closing" },
      { prNumber: 11, source: "closing" },
    ]);

    expect(getIssueListItem(repo.id, 1)?.pullRequest).toEqual({
      total: 2,
      open: 1,
      merged: 1,
      closed: 0,
      checksState: "failure",
      checksFailed: 1,
    });

    const detail = getIssueDetail(repo.id, 1);
    expect(detail?.pullRequests).toHaveLength(2);
    expect(detail?.pullRequests[0]).toMatchObject({
      number: 10,
      state: "open",
      reviewDecision: "approved",
      checks: { state: "failure", total: 3, failed: 1 },
    });
    expect(detail?.pullRequests[1]).toMatchObject({
      number: 11,
      state: "merged",
      merged: true,
    });
  });

  test("an issue without links has no indicator and an empty panel", () => {
    seedIssue(2);
    expect(getIssueListItem(repo.id, 2)?.pullRequest).toBeUndefined();
    expect(getIssueDetail(repo.id, 2)?.pullRequests).toEqual([]);
  });
});
