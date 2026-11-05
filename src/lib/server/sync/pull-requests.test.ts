import { beforeEach, describe, expect, test } from "bun:test";
import type { Thread } from "forges";
import { buildVocabulary } from "#lib/labels";
import { db } from "#lib/server/db/index";
import { mirrorPullRequest } from "#lib/server/db/schema";
import { mirrorIssuePullRequest } from "#lib/server/db/schema";
import { clearMirror } from "#tests/mirror-helpers";
import * as mirror from "./mirror";
import {
  applyPullRequestStatuses,
  deriveReviewDecision,
  discoverLinkedPullRequests,
  normalizePullRequest,
  syncPullRequestsForIssues,
  withStatusLabel,
} from "./pull-requests";

const REPO = {
  externalId: "1",
  forge: "github",
  instance: "github.com",
  org: "orgA",
  name: "core",
  url: "https://github.com/orgA/core",
  archived: false,
};

interface FakeReview {
  user?: { login?: string };
  state?: string;
}

let repo: mirror.RepoRow;
let links: Map<number, Thread[]>;
let tracked: Map<number, Thread>;
let reviews: Map<number, FakeReview[]>;
let labelWrites: Array<{ number: number; labels: string[] }>;
let closes: number[];
let reviewCalls: number[];

function prThread(
  number: number,
  overrides: {
    state?: "open" | "closed" | "merged" | "unknown";
    isDraft?: boolean;
    title?: string;
    updatedAt?: string;
    checks?: Thread["checks"];
    reviewers?: Thread["reviewers"];
  } = {},
): Thread {
  return {
    ref: {
      forge: "github",
      instance: "github.com",
      repo: {
        forge: "github",
        instance: "github.com",
        owner: "orgA",
        name: "core",
      },
      kind: "pull_request",
      number: String(number),
      externalId: `PR_${number}`,
    },
    kind: "pull_request",
    title: overrides.title ?? `PR ${number}`,
    state: overrides.state ?? "open",
    isDraft: overrides.isDraft ?? false,
    assignees: [],
    reviewers: overrides.reviewers ?? [],
    labels: [],
    url: `https://github.com/orgA/core/pull/${number}`,
    author: {
      forge: "github",
      instance: "github.com",
      login: "octocat",
      id: "7",
      avatarUrl: "https://avatars/octocat.png",
      url: "https://github.com/octocat",
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date(overrides.updatedAt ?? "2026-01-02T00:00:00Z"),
    ...(overrides.state === "merged"
      ? { mergedAt: new Date("2026-01-03T00:00:00Z") }
      : {}),
    ...(overrides.checks ? { checks: overrides.checks } : {}),
  } as unknown as Thread;
}

function seedIssue(number: number, status = "todo"): void {
  mirror.upsertIssue(
    {
      externalId: `I_${number}`,
      repoId: repo.id,
      number,
      kind: "issue",
      title: `Issue ${number}`,
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: `https://github.com/orgA/core/issues/${number}`,
      createdAt: 1,
      updatedAt: 2,
      closedAt: null,
      labels: [status],
      assignees: [],
      comments: [],
    },
    {
      status,
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      labelConflict: false,
    },
  );
}

function provider() {
  return {
    request: async (method: string, path: string) => {
      expect(method).toBe("GET");
      const match = path.match(/\/pulls\/(\d+)\/reviews$/);
      const number = Number(match?.[1]);
      reviewCalls.push(number);
      return { data: reviews.get(number) ?? [] };
    },
    threads: {
      closingPullRequests: (ref: { number: string }) => ({
        page: async () => ({
          items: links.get(Number(ref.number)) ?? [],
        }),
      }),
      getMany: async (refs: Array<{ number: string }>) =>
        refs.map((ref) => {
          const thread = tracked.get(Number(ref.number));
          return thread
            ? { ok: true as const, ref, thread }
            : {
                ok: false as const,
                ref,
                warning: { code: "not_found", message: "missing" },
              };
        }),
      setLabels: async (ref: { number: string }, labels: string[]) => {
        labelWrites.push({ number: Number(ref.number), labels });
        return [];
      },
      close: async (ref: { number: string }) => {
        closes.push(Number(ref.number));
        return prThread(Number(ref.number), { state: "closed" });
      },
    },
  } as never;
}

beforeEach(() => {
  clearMirror();
  repo = mirror.upsertRepo(REPO);
  links = new Map();
  tracked = new Map();
  reviews = new Map();
  labelWrites = [];
  closes = [];
  reviewCalls = [];
});

describe("deriveReviewDecision", () => {
  test("takes each reviewer's latest verdict", () => {
    const summary = deriveReviewDecision([
      { author: "ann", state: "CHANGES_REQUESTED" },
      { author: "ann", state: "APPROVED" },
      { author: "bob", state: "COMMENTED" },
    ]);
    expect(summary).toEqual({
      decision: "approved",
      approvedCount: 1,
      changesRequestedCount: 0,
    });
  });

  test("changes requested wins over approval", () => {
    expect(
      deriveReviewDecision([
        { author: "ann", state: "APPROVED" },
        { author: "bob", state: "CHANGES_REQUESTED" },
      ]),
    ).toMatchObject({ decision: "changes_requested", changesRequestedCount: 1 });
  });

  test("falls back to review required and pending", () => {
    expect(deriveReviewDecision([], 2).decision).toBe("review_required");
    expect(
      deriveReviewDecision([{ author: "ann", state: "COMMENTED" }]).decision,
    ).toBe("pending");
    expect(deriveReviewDecision([]).decision).toBeNull();
  });
});

describe("normalizePullRequest", () => {
  test("maps state, draft, checks and author", () => {
    const record = normalizePullRequest(
      prThread(12, {
        isDraft: true,
        checks: {
          state: "failure",
          total: 4,
          failed: 2,
          url: "https://github.com/orgA/core/pull/12/checks",
        },
      }),
      repo,
    );

    expect(record).toMatchObject({
      repoId: repo.id,
      number: 12,
      state: "open",
      isDraft: true,
      merged: false,
      checks: {
        state: "failure",
        total: 4,
        failed: 2,
        url: "https://github.com/orgA/core/pull/12/checks",
      },
      author: { externalId: "7", login: "octocat" },
    });
  });

  test("merged PRs set both state and merged flag", () => {
    const record = normalizePullRequest(
      prThread(13, { state: "merged" }),
      repo,
    );
    expect(record.state).toBe("merged");
    expect(record.merged).toBe(true);
  });
});

describe("withStatusLabel", () => {
  test("replaces the configured status group and keeps other labels", () => {
    const vocabulary = buildVocabulary("funnel");
    expect(
      withStatusLabel(["funnel-todo", "bug", "sev"], "in-review", vocabulary),
    ).toEqual(["bug", "sev", "funnel-in-review"]);
    // Re-running is idempotent.
    expect(
      withStatusLabel(
        ["bug", "funnel-in-review"],
        "in-review",
        vocabulary,
      ),
    ).toEqual(["bug", "funnel-in-review"]);
  });
});

describe("link discovery", () => {
  test("reads closing pull requests only", async () => {
    links.set(1, [
      prThread(10),
      {
        ...prThread(11),
        kind: "issue",
      } as Thread,
    ]);
    const found = await discoverLinkedPullRequests(provider(), repo, 1);
    expect(found.map((thread) => thread.ref.number)).toEqual(["10"]);
  });
});

describe("syncPullRequestsForIssues", () => {
  test("stores links, checks and reviews without creating issue rows", async () => {
    seedIssue(1);
    const thread = prThread(10, {
      checks: { state: "pending", total: 3, failed: 0 },
    });
    links.set(1, [thread]);
    tracked.set(10, thread);
    reviews.set(10, [{ user: { login: "ann" }, state: "APPROVED" }]);

    const result = await syncPullRequestsForIssues(provider(), repo, [1]);

    expect(result).toMatchObject({ issues: 1, pullRequests: 1 });
    const stored = mirror.getIssuePullRequests(repo.id, 1);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      number: 10,
      state: "open",
      checksState: "pending",
      reviewDecision: "approved",
      approvedCount: 1,
      source: "closing",
    });
    // A pull request is never an issue row.
    expect(mirror.getIssue(repo.id, 10)).toBeUndefined();
    expect(
      db.select().from(mirrorPullRequest).all().map((row) => row.number),
    ).toEqual([10]);
  });

  test("does not re-read reviews for an unchanged pull request", async () => {
    seedIssue(1);
    const thread = prThread(10);
    links.set(1, [thread]);
    tracked.set(10, thread);
    reviews.set(10, [{ user: { login: "ann" }, state: "APPROVED" }]);

    await syncPullRequestsForIssues(provider(), repo, [1]);
    expect(reviewCalls).toEqual([10]);

    await syncPullRequestsForIssues(provider(), repo, [1]);
    expect(reviewCalls).toEqual([10]);
  });

  test("reflects a merge picked up by the batched refresh", async () => {
    seedIssue(1);
    links.set(1, [prThread(10)]);
    tracked.set(10, prThread(10));
    await syncPullRequestsForIssues(provider(), repo, [1]);

    tracked.set(
      10,
      prThread(10, {
        state: "merged",
        updatedAt: "2026-01-03T00:00:00Z",
      }),
    );
    await syncPullRequestsForIssues(provider(), repo, []);

    expect(mirror.getIssuePullRequests(repo.id, 1)[0]).toMatchObject({
      state: "merged",
      mergedAt: expect.any(Number),
    });
  });

  test("prunes links and pull requests that disappear upstream", async () => {
    seedIssue(1);
    const thread = prThread(10);
    links.set(1, [thread]);
    tracked.set(10, thread);
    await syncPullRequestsForIssues(provider(), repo, [1]);
    expect(
      db.select().from(mirrorIssuePullRequest).all(),
    ).toHaveLength(1);

    links.set(1, []);
    tracked.delete(10);
    await syncPullRequestsForIssues(provider(), repo, [1]);

    expect(db.select().from(mirrorIssuePullRequest).all()).toHaveLength(0);
    expect(db.select().from(mirrorPullRequest).all()).toHaveLength(0);
  });

  test("auto-status is off by default", async () => {
    seedIssue(1);
    const thread = prThread(10);
    links.set(1, [thread]);
    tracked.set(10, thread);

    await syncPullRequestsForIssues(provider(), repo, [1], {
      autoStatus: {
        inReview: false,
        done: false,
        vocabulary: buildVocabulary(""),
      },
    });

    expect(labelWrites).toEqual([]);
    expect(closes).toEqual([]);
    expect(mirror.getIssue(repo.id, 1)?.status).toBe("todo");
  });

  test("moves an open issue to In Review when a PR is open", async () => {
    seedIssue(1);
    const thread = prThread(10);
    links.set(1, [thread]);
    tracked.set(10, thread);
    const vocabulary = buildVocabulary("funnel");
    seedIssue(1, "funnel-todo");

    await syncPullRequestsForIssues(provider(), repo, [1], {
      autoStatus: { inReview: true, done: true, vocabulary },
    });

    expect(labelWrites).toEqual([
      { number: 1, labels: ["funnel-in-review"] },
    ]);
    expect(mirror.getIssue(repo.id, 1)?.status).toBe("in-review");
    expect(closes).toEqual([]);
  });

  test("closes an open issue once every linked PR is finished", async () => {
    seedIssue(1);
    links.set(1, [prThread(10, { state: "merged" })]);
    tracked.set(10, prThread(10, { state: "merged" }));

    await syncPullRequestsForIssues(provider(), repo, [1], {
      autoStatus: {
        inReview: true,
        done: true,
        vocabulary: buildVocabulary(""),
      },
    });

    expect(closes).toEqual([1]);
    expect(mirror.getIssue(repo.id, 1)).toMatchObject({
      state: "closed",
      stateReason: "completed",
    });
    expect(labelWrites).toEqual([]);
  });

  test("repeated transitions are idempotent", async () => {
    seedIssue(1);
    const thread = prThread(10);
    links.set(1, [thread]);
    tracked.set(10, thread);
    const options = {
      autoStatus: {
        inReview: true,
        done: true,
        vocabulary: buildVocabulary(""),
      },
    };

    await syncPullRequestsForIssues(provider(), repo, [1], options);
    await syncPullRequestsForIssues(provider(), repo, [1], options);

    expect(labelWrites).toHaveLength(1);
    expect(closes).toHaveLength(0);
  });

  test("applyPullRequestStatuses skips issues without links", async () => {
    seedIssue(1);
    const transitions = await applyPullRequestStatuses(
      provider(),
      repo,
      [1],
      {
        inReview: true,
        done: true,
        vocabulary: buildVocabulary(""),
      },
    );
    expect(transitions).toBe(0);
    expect(labelWrites).toEqual([]);
  });
});
